import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { type ConfigType } from '@nestjs/config';
import jwtConfig from 'src/iam/infrastructure/config/jwt.config';
import { AuthSession } from 'src/iam/applications/models/auth-token';

/**
 * Le strict minimum d'un store adossé à Redis : de quoi tenter un `GETDEL`
 * atomique quand le driver l'expose, sans rien supposer d'autre. Décrit ici
 * parce que les types de cache-manager v7 ne l'exposent plus (cf.
 * `getAndDeleteOAuthCode`).
 */
interface RedisBackedStore {
  getClient?: () => { getdel?: (key: string) => Promise<string | null> };
}

/**
 * Ce qui ouvre ou prolonge une session : l'identifiant du refresh token en
 * cours, et le code à usage unique qui clôt un parcours OAuth.
 *
 * Les deux vont ensemble parce qu'ils portent la même chose — le droit d'être
 * connecté. Le code OAuth n'est qu'une session en transit : il est échangé
 * contre les tokens dans les trente secondes. Les tokens email
 * ([TokenEmailCacheService]) et les challenges MFA
 * ([MFAChallengeCacheService]) prouvent au contraire une possession, avant que
 * la session n'existe.
 */
@Injectable()
export class SessionCacheService {
  private readonly logger = new Logger(SessionCacheService.name);

  /**
   * Borne absolue d'une opération de cache sur le chemin d'authentification.
   *
   * Panne constatée : Redis éteint, le client mettait les commandes en file
   * d'attente et `insertRefreshTokenId` — appelé par l'émission des jetons —
   * ne se résolvait JAMAIS : sign-in muet pendant 90 s+ pour tous les
   * utilisateurs. Le client est désormais borné à la source (cache.config.ts,
   * `disableOfflineQueue`) ; ce délai est la ceinture : quelle que soit la
   * bibliothèque de cache branchée demain, une session ne peut pas rester
   * suspendue à un cache plus de deux secondes.
   */
  private static readonly CACHE_TIMEOUT_MS = 2_000;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  /** Applique la borne : rejette au-delà de CACHE_TIMEOUT_MS. */
  private withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
    return Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`cache ${label}: délai dépassé`)),
          SessionCacheService.CACHE_TIMEOUT_MS,
        );
        // Ne jamais retenir le process à cause d'un timer d'attente.
        timer.unref?.();
      }),
    ]);
  }

  // ── Refresh tokens ────────────────────────────────────────────────────────

  /**
   * Le TTL est repris de la durée de vie du refresh token : la config parle en
   * secondes, le cache en millisecondes.
   *
   * DÉGRADATION ASSUMÉE : si le cache est en panne, on N'EMPÊCHE PAS la
   * connexion — l'access token reste valable, seul le rafraîchissement
   * échouera (l'utilisateur se reconnectera). L'inverse — refuser toute
   * connexion parce qu'un cache est tombé — est la panne qu'on vient de vivre.
   */
  async insertRefreshTokenId(
    email: string,
    refreshTokenId: string,
  ): Promise<void> {
    try {
      await this.withTimeout(
        this.cacheManager.set<string>(
          this.getRefreshTokenKey(email),
          refreshTokenId,
          this.jwtConfiguration.refreshTokenTtl * 1000,
        ),
        'set refresh',
      );
    } catch (error) {
      this.logger.warn(
        `Refresh token non enregistré (cache indisponible) — connexion accordée, ` +
          `le rafraîchissement échouera jusqu'au retour du cache : ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  /**
   * Cache en panne → `false` : un rafraîchissement invérifiable est REFUSÉ
   * (l'utilisateur se reconnecte), jamais accordé à l'aveugle — c'est ce
   * contrôle qui empêche le rejeu d'un refresh token volé.
   */
  async validateRefreshToken(
    email: string,
    refreshTokenId: string,
  ): Promise<boolean> {
    try {
      const storedId = await this.withTimeout(
        this.cacheManager.get<string>(this.getRefreshTokenKey(email)),
        'get refresh',
      );
      return storedId === refreshTokenId;
    } catch (error) {
      this.logger.warn(
        `Vérification du refresh token impossible (cache indisponible) — refusée : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async invalidateRefreshTokenId(email: string): Promise<void> {
    try {
      await this.withTimeout(
        this.cacheManager.del(this.getRefreshTokenKey(email)),
        'del refresh',
      );
    } catch (error) {
      this.logger.warn(
        `Invalidation du refresh token impossible (cache indisponible) : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private getRefreshTokenKey(email: string) {
    return `refresh-${email}`;
  }

  // ── Codes OAuth ───────────────────────────────────────────────────────────

  /**
   * Le code OAuth à usage unique porte la session complète (tokens + compte)
   * et non les seuls tokens : au moment de l'échange, le contexte de
   * l'authentification sociale est perdu, et sans cela il faudrait relire le
   * compte en base pour renvoyer la même réponse que sign-in.
   */
  async insertOAuthCode(code: string, session: AuthSession): Promise<void> {
    // Ici l'échec DOIT remonter : un code émis mais jamais stocké serait
    // inéchangeable — mieux vaut faire échouer le callback OAuth tout de
    // suite que rediriger l'utilisateur vers un échange voué au 401. La borne
    // garantit seulement que cet échec arrive en secondes, pas en minutes.
    await this.withTimeout(
      this.cacheManager.set(this.getOAuthCodeKey(code), session, 30_000),
      'set oauth',
    );
  }

  async getAndDeleteOAuthCode(code: string): Promise<AuthSession | null> {
    try {
      return await this.getAndDeleteOAuthCodeUnbounded(code);
    } catch (error) {
      // Cache en panne → code réputé invalide : l'utilisateur relance sa
      // connexion sociale. Jamais de session accordée sur un doute.
      this.logger.warn(
        `Échange du code OAuth impossible (cache indisponible) — refusé : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async getAndDeleteOAuthCodeUnbounded(
    code: string,
  ): Promise<AuthSession | null> {
    const key = this.getOAuthCodeKey(code);

    // cache-manager v7 : la propriété `store` (singulier) n'existe plus dans
    // les types (c'est `stores`, un tableau de Keyv). L'accès brut au client
    // Redis reste tenté au runtime, d'où ce transtypage ; il ne réussit que si
    // un store Redis est effectivement câblé — ce qui n'est pas le cas
    // aujourd'hui, `CacheModule.register()` ne sélectionnant aucun driver.
    const { store } = this.cacheManager as unknown as {
      store?: RedisBackedStore;
    };
    const client = store?.getClient?.();

    if (client?.getdel) {
      // Lecture et suppression en une opération : un code OAuth ne doit pouvoir
      // être échangé qu'une fois, même si deux requêtes le présentent ensemble.
      const raw = await this.withTimeout(client.getdel(key), 'getdel oauth');
      return raw ? (JSON.parse(raw) as AuthSession) : null;
    }

    // Repli non atomique. Acceptable ici : le code est à usage unique et vit
    // 30 secondes, et la fenêtre entre le `get` et le `del` est minuscule.
    const session = await this.withTimeout(
      this.cacheManager.get<AuthSession>(key),
      'get oauth',
    );
    if (session)
      await this.withTimeout(this.cacheManager.del(key), 'del oauth');
    return session ?? null;
  }

  private getOAuthCodeKey(code: string) {
    return `oauth-code:${code}`;
  }
}
