import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OTP_SERVICE, type OtpService } from 'src/iam/domain/ports/otp.service';
import {
  TWO_FACTOR_GATEWAY,
  type TwoFactorGateway,
  TwoFactorMethod,
} from 'src/iam/domain/ports/two-factor.gateway';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import { OtpTarget } from 'src/iam/domain/value-objects/otp-target.vo';
import {
  InvalidCredentialsError,
  InvalidOtpError,
  PhoneNumberRequiredError,
  TwoFactorNotEnrolledError,
} from 'src/iam/domain/errors/iam.errors';
import { TwoFactorChallengeService } from '../two-factor-challenge.service';
import {
  ConfirmTwoFactorCommand,
  DisableTwoFactorCommand,
  EnrollTwoFactorCommand,
  TwoFactorEnabled,
  TwoFactorEnrollmentStarted,
} from './two-factor.commands';

@CommandHandler(EnrollTwoFactorCommand)
export class EnrollTwoFactorHandler implements ICommandHandler<EnrollTwoFactorCommand> {
  constructor(
    @Inject(TWO_FACTOR_GATEWAY) private readonly twoFactor: TwoFactorGateway,
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
    private readonly challenges: TwoFactorChallengeService,
  ) {}

  async execute(
    command: EnrollTwoFactorCommand,
  ): Promise<TwoFactorEnrollmentStarted> {
    const { accountId, email, method } = command;

    if (method === TwoFactorMethod.TOTP) {
      // Le secret est persisté dès maintenant, inactif : sans cela, il faudrait
      // que le client nous le renvoie pour la confirmation — et un secret qui
      // fait l'aller-retour par le réseau n'est plus un secret partagé.
      const { uri, secret } = this.otpService.generateTotpSecret(email);
      await this.twoFactor.startEnrollment(accountId, method, secret);
      return { method, uri, secret };
    }

    const credential =
      method === TwoFactorMethod.SMS
        ? EnrollTwoFactorHandler.normalizePhone(command.phone)
        : email;

    await this.twoFactor.startEnrollment(accountId, method, credential);

    await this.challenges.send(email, {
      method,
      credential,
      isActive: false,
    });

    return { method, sentTo: credential };
  }

  /** Le VO valide le format E.164 et normalise ; on ne stocke rien d'autre. */
  private static normalizePhone(phone?: string): string {
    if (!phone) throw new PhoneNumberRequiredError();
    return OtpTarget.phone(phone).value;
  }
}

@CommandHandler(ConfirmTwoFactorCommand)
export class ConfirmTwoFactorHandler implements ICommandHandler<ConfirmTwoFactorCommand> {
  constructor(
    @Inject(TWO_FACTOR_GATEWAY) private readonly twoFactor: TwoFactorGateway,
    private readonly challenges: TwoFactorChallengeService,
  ) {}

  async execute(command: ConfirmTwoFactorCommand): Promise<TwoFactorEnabled> {
    const { accountId, email, method, otp } = command;

    const enrollment = await this.twoFactor.findEnrollment(accountId, method);
    if (!enrollment) throw new TwoFactorNotEnrolledError();

    const isValid = await this.challenges.verify(email, enrollment, otp);
    if (!isValid) throw new InvalidOtpError();

    // Activer ce canal désactive les autres : le compte n'a qu'une méthode.
    await this.twoFactor.activate(accountId, method);

    return { twoFactorMethod: method };
  }
}

@CommandHandler(DisableTwoFactorCommand)
export class DisableTwoFactorHandler implements ICommandHandler<DisableTwoFactorCommand> {
  constructor(
    @Inject(TWO_FACTOR_GATEWAY) private readonly twoFactor: TwoFactorGateway,
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
  ) {}

  async execute(command: DisableTwoFactorCommand): Promise<void> {
    // Retirer un facteur d'authentification est une opération sensible : un
    // access token volé ne doit pas suffire à le faire.
    const isValid = await this.accounts.verifyPassword(
      command.email,
      command.password,
    );
    if (!isValid) throw new InvalidCredentialsError();

    await this.twoFactor.disable(command.accountId);
  }
}
