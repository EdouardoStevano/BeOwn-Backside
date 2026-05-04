import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EMAIL_SERVICE } from '../email/email.service';
import { SMS_SERVICE } from '../sms/sms.service';
import { BrevoEmailService } from '../email/brevo.service';
import { TwilioSmsService } from '../sms/twilio-sms.service';
import { NotificationTestController } from './notification-test.controller';

@Module({
  imports: [ConfigModule],
  providers: [
    { provide: EMAIL_SERVICE, useClass: BrevoEmailService },
    { provide: SMS_SERVICE, useClass: TwilioSmsService },
  ],
  controllers: [NotificationTestController],
})
export class NotificationTestModule {}
