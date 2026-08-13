import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { type ConfigType } from '@nestjs/config';
import jwtConfig from 'src/iam/infrastructure/config/jwt.config';
import { EmailTokenPurpose } from 'src/iam/applications/ports/token.port';

/**
 * Identifiants des tokens envoyés par email — vérification d'adresse et
 * réinitialisation de mot de passe.
 *
 * Le token lui-même est un JWT signé, il n'est pas stocké ; c'est son
 * identifiant qui l'est, ce qui permet de le révoquer une fois consommé. Sans
 * ça, un lien reçu par email resterait rejouable jusqu'à son échéance.
 */
@Injectable()
export class TokenEmailCacheService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  /** Le TTL suit celui du token : la config parle en secondes, le cache en ms. */
  async insertEmailTokenId(
    email: string,
    emailTokenId: string,
    purpose: EmailTokenPurpose,
  ): Promise<void> {
    await this.cacheManager.set<string>(
      this.getEmailTokenKey(email, purpose),
      emailTokenId,
      this.jwtConfiguration.emailTokenTtl * 1000,
    );
  }

  async validateEmailToken(
    email: string,
    emailTokenId: string,
    purpose: EmailTokenPurpose,
  ): Promise<boolean> {
    const storedId = await this.cacheManager.get<string>(
      this.getEmailTokenKey(email, purpose),
    );
    return storedId === emailTokenId;
  }

  async invalidateEmailTokenId(
    email: string,
    purpose: EmailTokenPurpose,
  ): Promise<void> {
    await this.cacheManager.del(this.getEmailTokenKey(email, purpose));
  }

  /**
   * `purpose` cloisonne l'identifiant stocké : un token de vérification
   * d'adresse et un token de réinitialisation émis pour la même adresse ne
   * partagent jamais le même emplacement. Ils l'ont partagé, à l'époque où seul
   * le parcours de vérification utilisait ce magasin — demander l'un
   * invalidait silencieusement une demande de l'autre encore en vol.
   */
  private getEmailTokenKey(email: string, purpose: EmailTokenPurpose) {
    return `email-token-${purpose}-${email}`;
  }
}
