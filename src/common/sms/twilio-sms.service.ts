import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import Twilio from 'twilio';

// E.164: leading '+', country code (1-9, no leading zero), then up to 14
// more digits. We deliberately do NOT try to guess/normalize a missing '+'
// or a missing country code — callers (usecases) own phone resolution and
// must hand us an already-normalized E.164 number. Guessing a country here
// would silently misroute SMS across markets (BeOwn is multi-marché).
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

@Injectable()
export class TwilioSmsService implements SmsService {
  private readonly logger = new Logger(TwilioSmsService.name);
  private readonly client: ReturnType<typeof Twilio>;
  private readonly fromNumber: string;

  constructor(private readonly config: ConfigService) {
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.config.getOrThrow<string>('TWILIO_PHONE_NUMBER');
    this.client = Twilio(accountSid, authToken);
  }

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    await this.send(
      phoneNumber,
      `[BeOwn] Votre code de vérification : ${code}. Valide 5 minutes.`,
    );
  }

  async sendTransactional(
    phoneNumber: string,
    message: string,
  ): Promise<void> {
    await this.send(phoneNumber, message);
  }

  private async send(to: string, body: string): Promise<void> {
    if (!E164_REGEX.test(to)) {
      throw new Error(
        `Numéro de téléphone invalide "${to}" : le format E.164 est requis ` +
          '(indicatif pays + numéro, ex: +33612345678). Aucune normalisation ' +
          "ou détection de pays par défaut n'est appliquée.",
      );
    }

    try {
      const result = await this.client.messages.create({
        to,
        from: this.fromNumber,
        body,
      });
      this.logger.log(`SMS sent to ${to}, SID: ${result.sid}`);
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${to}`, error);
      throw error;
    }
  }
}
