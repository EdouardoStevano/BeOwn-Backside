import { Command } from '@nestjs/cqrs';
import { SocialProfile } from 'src/iam/domain/models/social-profile';

/**
 * Le handler ne rend pas les tokens : il rend un code d'échange à usage unique.
 * Les tokens ne doivent pas transiter par l'URL de redirection OAuth, où ils
 * finiraient dans l'historique du navigateur et les logs du proxy.
 */
export interface SocialAuthResult {
  code: string;
  isNewUser: boolean;
}

export class SocialAuthCommand extends Command<SocialAuthResult> {
  constructor(public readonly social: SocialProfile) {
    super();
  }
}
