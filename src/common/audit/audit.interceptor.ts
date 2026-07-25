import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';

const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];
const SENSITIVE = /password|token|secret|otp|iban|cvv|card/i;
const MAX_BODY_BYTES = 2048;

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

  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    if (!MUTATING.includes(request.method) || !request.user) {
      return next.handle();
    }

    const started = Date.now();
    const write = (statusCode: number) => {
      const routePath: string = request.route?.path ?? request.url;
      const segments = routePath.split('/').filter(Boolean);
      const objetType =
        (segments[0] === 'admin' ? segments[1] : segments[0]) ?? undefined;
      const params = request.params ?? {};
      const objetId =
        (params.id ?? params.txId ?? Object.values(params)[0]) ?? undefined;

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
            body: sanitizeBody(request.body),
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
        error: (err) => write(err?.status ?? 500),
      }),
    );
  }
}
