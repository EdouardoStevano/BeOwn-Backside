import { Command } from '@nestjs/cqrs';
import { AuthTokens } from 'src/iam/domains/ports/token.service';
import { SocialInterface } from '../../infrastructures/interfaces/social.interface';

export type SocialAuthResult = AuthTokens & { isNewUser: boolean };

export class SocialAuthCommand extends Command<SocialAuthResult> {
  constructor(public readonly social: SocialInterface) {
    super();
  }
}
