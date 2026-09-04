import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { AUDIT_SANS_CORPS_KEY } from './audit-sans-corps.decorator';
import { statutHttpDeLErreur } from './statut-erreur-metier';

const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];
const SENSITIVE = /password|token|secret|otp|iban|cvv|card/i;
const MAX_BODY_BYTES = 2048;

/**
 * Ressources dont les mutations n'ont aucune valeur d'audit. Marquer une
 * notification comme lue, ou la supprimer, est une action de confort : une
 * ligne par notification consultée noyait le journal d'activité sous du bruit,
 * masquant les décisions réellement traçables (KYC, retraits, rôles).
 *
 * Ne concerne QUE les routes utilisateur. Les diffusions `/admin/notifications`
 * restent auditées — elles sont d'ailleurs déjà tracées explicitement par
 * BroadcastService.
 */
const AUDIT_EXCLUDED_RESOURCES = new Set(['notifications']);

export function sanitizeBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? '[MASQUE]' : v;
  }
  const raw = JSON.stringify(out);
  return raw.length > MAX_BODY_BYTES
    ? { _truncated: raw.slice(0, MAX_BODY_BYTES) }
    : out;
}

/**
 * Journalise toute mutation (POST/PUT/PATCH/DELETE) authentifiée dans
 * audit_log. Écriture après réponse, non bloquante : un échec d'audit ne
 * fait jamais échouer la requête métier. Complète (ne remplace pas) les
 * logs métier manuels des usecases qui passent déjà des métadonnées
 * fonctionnelles.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly reflector: Reflector,
  ) {}

  /**
   * La route est-elle marquée `@AuditSansCorps()` ? Défensif sur l'absence de
   * `getHandler`/`getClass` : certains contextes d'appel (tests, adaptateurs
   * non HTTP) ne les exposent pas, et l'audit ne doit jamais faire échouer la
   * requête qu'il observe.
   */
  private corpsExclu(context: ExecutionContext): boolean {
    const cibles = [context.getHandler?.(), context.getClass?.()].filter(
      Boolean,
    );
    if (cibles.length === 0) return false;
    return (
      this.reflector?.getAllAndOverride<boolean>(
        AUDIT_SANS_CORPS_KEY,
        cibles as Parameters<Reflector['getAllAndOverride']>[1],
      ) === true
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    if (!MUTATING.includes(request.method) || !request.user) {
      return next.handle();
    }

    const routeSegments: string[] = (request.route?.path ?? request.url)
      .split('/')
      .filter(Boolean);
    // Exclusion évaluée avant tout travail : hors périmètre admin uniquement.
    if (
      routeSegments[0] !== 'admin' &&
      AUDIT_EXCLUDED_RESOURCES.has(routeSegments[0])
    ) {
      return next.handle();
    }

    const started = Date.now();
    const corpsExclu = this.corpsExclu(context);
    const write = (statusCode: number) => {
      const routePath: string = request.route?.path ?? request.url;
      const segments = routePath.split('/').filter(Boolean);
      const objetType =
        (segments[0] === 'admin' ? segments[1] : segments[0]) ?? undefined;
      const params = request.params ?? {};
      const objetId =
        params.id ?? params.txId ?? Object.values(params)[0] ?? undefined;

      this.auditLogService
        .create(
          String(request.user.userId),
          request.user.role,
          `${request.method} ${routePath}`,
          objetType,
          objetId as string | undefined,
          request.ip,
          request.headers?.['user-agent'],
          {
            statusCode,
            durationMs: Date.now() - started,
            // Le marqueur remplace le corps : la ligne d'audit dit qu'un corps
            // a existé et pourquoi il n'est pas là, plutôt que de laisser
            // croire à une requête sans données.
            body: corpsExclu
              ? { _exclu: 'corps non journalisé (texte libre nominatif)' }
              : sanitizeBody(request.body),
          },
        )
        .catch((err) =>
          this.logger.error(`Écriture audit échouée: ${err.message}`),
        );
    };

    return next.handle().pipe(
      tap({
        next: () =>
          write(context.switchToHttp().getResponse()?.statusCode ?? 200),
        // Le statut vient du RÉSOLVEUR et non de `err.status` : les erreurs
        // métier du dépôt ne sont pas des HttpException — elles ignorent HTTP
        // par construction et sont traduites par un filtre qui s'exécute APRÈS
        // cet intercepteur. Sans cela, tout refus métier (409, 403, 429) était
        // journalisé « 500 » pendant cinq ans.
        error: (err) => write(statutHttpDeLErreur(err)),
      }),
    );
  }
}
