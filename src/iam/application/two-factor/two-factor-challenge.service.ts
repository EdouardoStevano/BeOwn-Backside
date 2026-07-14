import { Inject, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OTP_SERVICE, type OtpService } from 'src/iam/domain/ports/otp.service';
import {
  TwoFactorEnrollment,
  TwoFactorMethod,
} from 'src/iam/domain/ports/two-factor.gateway';
import { OtpAlreadyActiveError } from 'src/iam/domain/errors/iam.errors';
import {
  SendEmailOtpCommand,
  SendSmsOtpCommand,
  VerifyEmailOtpCommand,
  VerifySmsOtpCommand,
} from 'src/iam/application/otp/commands/otp.commands';

/**
 * Envoyer un code sur un canal, et vérifier celui qu'on reçoit en retour.
 *
 * Les deux gestes sont identiques à l'enrôlement et au sign-in — seul change ce
 * qu'on en fait ensuite. Les mettre ici évite d'avoir deux implémentations du
 * même switch qui divergeraient au premier canal ajouté.
 *
 * L'envoi passe par le bus : les handlers OTP existants savent déjà générer,
 * envoyer, et invalider le code si la livraison échoue. Rien à réécrire.
 */
@Injectable()
export class TwoFactorChallengeService {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(OTP_SERVICE) private readonly otpService: OtpService,
  ) {}

  /** TOTP est un no-op : le code est calculé par l'application de l'utilisateur. */
  async send(email: string, enrollment: TwoFactorEnrollment): Promise<void> {
    try {
      switch (enrollment.method) {
        case TwoFactorMethod.EMAIL:
          await this.commandBus.execute(new SendEmailOtpCommand(email));
          break;
        case TwoFactorMethod.SMS:
          await this.commandBus.execute(
            new SendSmsOtpCommand(enrollment.credential),
          );
          break;
        case TwoFactorMethod.TOTP:
          break;
      }
    } catch (err) {
      // Un code est déjà en vol et reste valable : le renvoyer n'apporterait
      // rien, et refuser la connexion pour ça serait absurde.
      if (!(err instanceof OtpAlreadyActiveError)) throw err;
    }
  }

  verify(
    email: string,
    enrollment: TwoFactorEnrollment,
    code: string,
  ): Promise<boolean> {
    switch (enrollment.method) {
      case TwoFactorMethod.EMAIL:
        return this.commandBus.execute(new VerifyEmailOtpCommand(email, code));
      case TwoFactorMethod.SMS:
        return this.commandBus.execute(
          new VerifySmsOtpCommand(enrollment.credential, code),
        );
      case TwoFactorMethod.TOTP:
        return this.otpService.verifyTotp(code, enrollment.credential);
    }
  }
}
