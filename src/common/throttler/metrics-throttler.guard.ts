import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { TokenService } from 'src/iam/applications/services/token/token.service';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';

/** Préfixe du seau nominatif — évite toute collision avec une IP littérale. */
const PREFIXE_UTILISATEUR = 'u:';

/**
 * `ThrottlerGuard` étendu pour (1) émettre `beown_throttle_blocked_total` à
 * chaque blocage effectif et (2) compter PAR UTILISATEUR sur les requêtes
 * authentifiées (M-5 : les paliers vivent dans Redis, partagés par tous les
 * réplicas — voir `RedisThrottlerStorage`).
 *
 * ## Pourquoi un tracker nominatif
 *
 * Le tracker par défaut est `req.ip`. Derrière un NAT d'entreprise, un réseau
 * mobile ou un campus, tous les clients partagent une adresse : un seul
 * investisseur qui épuise un palier resserré (3 dépôts de demande par minute)
 * bloquait TOUS les autres — constaté en recette. Une limite « par client »
 * doit compter des clients, pas des tuyaux.
 *
 * Le seau redevient l'IP dès qu'aucune identité n'est établie : les routes
 * d'authentification (`sign-in`, OTP, réinitialisation) sont par construction
 * NON authentifiées, leur palier `auth` reste donc par IP — c'est exactement
 * ce qu'on veut d'une protection contre le bourrage d'identifiants, où
 * l'attaquant n'a précisément pas de compte.
 *
 * ## Pourquoi vérifier le jeton ici
 *
 * Ce garde est enregistré AVANT `JwtAuthGuard` (app.module) : `req.user`
 * n'existe donc pas encore quand le tracker est calculé. Deux options
 * écartées :
 *  - déplacer le throttler après l'authentification — un flot de jetons
 *    INVALIDES ne serait alors plus jamais limité (401 avant tout comptage),
 *    c'est-à-dire perdre la protection au moment précis où elle sert ;
 *  - lire le `sub` sans vérifier la signature — un attaquant choisirait son
 *    propre seau, et la limitation ne limiterait plus rien.
 *
 * On vérifie donc le jeton, et **seule une signature valide** donne droit à un
 * seau nominatif. Coût : une vérification HMAC supplémentaire par requête
 * authentifiée (aucune E/S, aucun accès base) — assumé, c'est le prix d'un
 * comptage juste. Toute erreur retombe silencieusement sur l'IP : le tracker
 * n'authentifie pas, il ne fait que choisir un compteur.
 *
 * ⚠ Zéro changement de comportement du blocage lui-même (délégué à
 * `super.handleRequest`) : uniquement un `try/catch` d'observation autour.
 */
@Injectable()
export class MetricsThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly metrics: MetricsPort,
    private readonly tokenService: TokenService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Seau de comptage : l'utilisateur authentifié, sinon l'IP.
   *
   * `req.user` est honoré s'il est déjà là (ordre de gardes différent, appel
   * de test) ; sinon le jeton porteur est vérifié.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userIdDejaResolu = (req?.user as { userId?: unknown } | undefined)
      ?.userId;
    if (userIdDejaResolu !== undefined && userIdDejaResolu !== null) {
      return `${PREFIXE_UTILISATEUR}${String(userIdDejaResolu)}`;
    }

    const jeton = this.extraireJetonPorteur(req);
    if (jeton) {
      try {
        const payload = await this.tokenService.verifyAccessToken(jeton);
        if (payload?.sub !== undefined && payload?.sub !== null) {
          return `${PREFIXE_UTILISATEUR}${String(payload.sub)}`;
        }
      } catch {
        // Jeton absent, expiré, mal formé ou signé par un autre secret : on ne
        // refuse rien ici (ce n'est pas le rôle d'un tracker), on retombe sur
        // l'IP — le comptage reste, la porte reste gardée par JwtAuthGuard.
      }
    }

    return super.getTracker(req);
  }

  private extraireJetonPorteur(req: Record<string, any>): string | undefined {
    const entete = (req?.headers as Record<string, unknown> | undefined)
      ?.authorization;
    if (typeof entete !== 'string') return undefined;
    const [type, jeton] = entete.split(' ');
    return type === 'Bearer' && jeton ? jeton : undefined;
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (err) {
      if (err instanceof ThrottlerException) {
        this.metrics.incrementCounter(METRIC.THROTTLE_BLOCKED_TOTAL, {
          throttler: requestProps.throttler.name ?? 'default',
        });
      }
      throw err;
    }
  }
}
