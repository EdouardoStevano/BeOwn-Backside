import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { SMS_SERVICE, type SmsService } from 'src/common/sms/sms.service';
import { User } from 'src/users/domains/user';
import {
  RegistrationOtpService,
  REGISTRATION_OTP_TTL_SECONDS,
} from './registration-otp.service';

export type RegistrationOtpCanal = 'email' | 'sms';

const otpEmailHtml = (firstname: string, code: string): string => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #1A2E35; margin-bottom: 8px;">Bienvenue sur BeOwn${firstname ? `, ${firstname}` : ''} !</h2>
    <p style="color: #333; font-size: 15px; line-height: 1.5;">
      Voici votre code de vérification pour activer votre compte :
    </p>
    <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1A2E35; text-align: center; margin: 24px 0;">
      ${code}
    </p>
    <p style="color: #666; font-size: 13px; line-height: 1.5;">
      Ce code est valable ${Math.round(REGISTRATION_OTP_TTL_SECONDS / 60)} minutes.
      Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.
    </p>
  </div>
`;

/**
 * Generates and delivers a registration OTP for a given user. Single
 * responsibility: hand the code to RegistrationOtpService and push it out
 * over the requested channel. Does not decide *whether* to send (cooldowns,
 * already-verified checks, phone resolution) — that policy lives in the two
 * call sites (RegisterUseCase for the initial send, ResendRegistrationOtpUseCase
 * for explicit resends), which also decide whether a delivery failure should
 * be swallowed (both do, per product decision: never let a mail/SMS outage
 * block signup or leak through resend-otp's non-enumerating contract).
 */
@Injectable()
export class SendRegistrationOtpUseCase {
  constructor(
    private readonly registrationOtpService: RegistrationOtpService,
    private readonly mailerService: MailerService,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
  ) {}

  async send(
    user: User,
    canal: RegistrationOtpCanal = 'email',
    phone?: string,
  ): Promise<void> {
    const email = user.userEmail.email;
    const code = await this.registrationOtpService.generate(email);

    try {
      if (canal === 'sms') {
        if (!phone) {
          // Defensive only: callers must resolve+validate the phone number
          // before requesting the 'sms' canal. Surfaced loudly (500) rather
          // than silently falling back to email, so a wiring bug shows up
          // immediately instead of masquerading as "email was sent".
          throw new InternalServerErrorException(
            "Numéro de téléphone manquant pour l'envoi du code par SMS.",
          );
        }
        await this.smsService.sendTransactional(
          phone,
          `[BeOwn] Votre code de vérification d'inscription : ${code}. Valide ${Math.round(REGISTRATION_OTP_TTL_SECONDS / 60)} minutes.`,
        );
      } else {
        await this.mailerService.sendMail({
          to: email,
          subject: 'Votre code de vérification BeOwn',
          html: otpEmailHtml(user.firstname, code),
        });
      }
    } catch (err) {
      // Same pattern as CreateEmailOtpUseCase/CreateSmsOtpUseCase: a failed
      // delivery invalidates the code (and its resend cooldown) so the user
      // isn't stuck for the rest of the TTL/cooldown window holding a code
      // they never received.
      await this.registrationOtpService.invalidate(email);
      throw err;
    }
  }
}
