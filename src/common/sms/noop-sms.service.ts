import { Injectable, Logger } from '@nestjs/common';
import { SmsService } from './sms.service';

/**
 * Placeholder SMS sender wired via DI for the registration-OTP flow (V2-T1).
 *
 * A real TwilioSmsService already exists in this repo and is bound to
 * SMS_SERVICE globally (iam.module.ts), but the registration module binds
 * SMS_SERVICE to this Noop on purpose so V2-T2 owns the decision of when to
 * flip the signup SMS channel onto the live Twilio sender (and any per-flow
 * cost/rate-limit guards that come with it). Until then, requesting the
 * `sms` canal logs the intent instead of sending — never throwing, so a
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
