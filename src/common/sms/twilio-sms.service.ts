import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import Twilio from 'twilio';

@Injectable()
export class TwilioSmsService implements SmsService {
  private readonly logger = new Logger(TwilioSmsService.name);
  private readonly client: ReturnType<typeof Twilio>;
  private readonly fromNumber: string;

  constructor(private readonly config: ConfigService) {
    const accountSid = this.config.getOrThrow('TWILIO_ACCOUNT_SID');
    const authToken = this.config.getOrThrow('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.config.getOrThrow('TWILIO_PHONE_NUMBER');
    this.client = Twilio(accountSid, authToken);
  }

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    await this.sendTransactional(
      phoneNumber,
      `[BeOwn] Votre code de vérification : ${code}. Valide 5 minutes.`,
    );
  }

  async sendTransactional(phoneNumber: string, message: string): Promise<void> {
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });
      this.logger.log(`SMS sent to ${phoneNumber}, SID: ${result.sid}`);
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${phoneNumber}`, error);
      throw error;
    }
  }
}
