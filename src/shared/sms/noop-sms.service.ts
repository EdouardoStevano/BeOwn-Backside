import { Injectable, Logger } from '@nestjs/common';
import { SmsService } from './sms.service';

/**
 * Placeholder SMS sender used as the fallback branch of the app-wide
 * SMS_SERVICE binding (see sms.module.ts's smsServiceFactory, global since
 * V2-T2): TwilioSmsService is selected when the three Twilio env vars are
 * present, this Noop otherwise (dev/CI without Twilio creds). Requesting the
 * `sms` canal then logs the intent instead of sending — never throwing, so a
 * missing provider never breaks the (non-enumerating) resend contract.
 */
@Injectable()
export class NoopSmsService implements SmsService {
  private readonly logger = new Logger(NoopSmsService.name);

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    this.logger.log(
      `[NoopSmsService] sendOtp -> ${phoneNumber} (code non envoyé — placeholder V2-T1, Twilio branché en V2-T2)`,
    );
    // Intentionally do not log the code.
    void code;
  }

  async sendTransactional(phoneNumber: string, message: string): Promise<void> {
    this.logger.log(
      `[NoopSmsService] sendTransactional -> ${phoneNumber} (message non envoyé — placeholder V2-T1)`,
    );
    void message;
  }
}
