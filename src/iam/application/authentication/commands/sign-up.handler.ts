import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import {
  CAPTCHA_VERIFIER,
  type CaptchaVerifier,
} from 'src/iam/domain/ports/captcha.verifier';
import { SignUpCommand } from './sign-up.command';

/**
 * Inscription depuis le tunnel d'authentification : anti-robot, puis délégation
 * de la création du compte au contexte Users.
 *
 * L'orchestration était auparavant dans le contrôleur HTTP, qui appelait
 * lui-même le service reCAPTCHA puis dispatchait une commande appartenant à un
 * autre module.
 */
@CommandHandler(SignUpCommand)
export class SignUpHandler implements ICommandHandler<SignUpCommand> {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(CAPTCHA_VERIFIER) private readonly captcha: CaptchaVerifier,
  ) {}

  async execute(command: SignUpCommand): Promise<unknown> {
    await this.captcha.verify(command.captchaToken);

    return this.accounts.register({
      firstname: command.firstname,
      lastname: command.lastname,
      email: command.email,
      password: command.password,
    });
  }
}
