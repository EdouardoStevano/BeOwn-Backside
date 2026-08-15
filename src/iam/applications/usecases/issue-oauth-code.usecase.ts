import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SessionCacheService } from '../services/session-cache.service';
import { SocialProfile } from 'src/iam/applications/models/social-profile';
import { SocialAuthUseCase } from './social-auth.usecase';

export interface IssuedOAuthCode {
  /** Code à usage unique (TTL 30 s) échangé ensuite contre les tokens. */
  code: string;
  isNewUser: boolean;
}

/**
 * Fin du parcours OAuth : authentifie le profil remonté par le fournisseur
 * puis dépose les tokens derrière un code à usage unique.
 *
 * Extrait du contrôleur, qui injectait le service de cache directement
 * (présentation → infrastructure, §12.9) et générait le code lui-même
 * (logique métier en présentation, §12.5). Le contrôleur ne garde que la
 * construction de l'URL de redirection.
 */
@Injectable()
export class IssueOAuthCodeUseCase {
  constructor(
    private readonly socialAuthUseCase: SocialAuthUseCase,
    private readonly sessionCache: SessionCacheService,
  ) {}

  async execute(profile: SocialProfile): Promise<IssuedOAuthCode> {
    const { isNewUser, ...session } =
      await this.socialAuthUseCase.authenticate(profile);

    // On dépose la session entière (tokens + compte), pas seulement les
    // tokens : l'échange se fait sur une autre requête, sans le profil social,
    // et doit renvoyer la même forme que sign-in.
    const code = randomUUID();
    await this.sessionCache.insertOAuthCode(code, session);

    return { code, isNewUser };
  }
}
