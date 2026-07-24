import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EMAIL_SERVICE } from '../email/email.service';
import { BrevoEmailService } from '../email/brevo.service';
import { NotificationTestController } from './notification-test.controller';

// SMS_SERVICE is intentionally NOT bound here anymore (V2-T2): this dev-only
// controller now gets it from the global SmsModule like everything else
// (Twilio if creds are set, Noop logging otherwise) instead of forcing a
// local unconditional TwilioSmsService that crashed dev boot without creds.
@Module({
  imports: [ConfigModule],
  providers: [{ provide: EMAIL_SERVICE, useClass: BrevoEmailService }],
  controllers: [NotificationTestController],
})
export class NotificationTestModule {}
