import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationTestController } from './notification-test.controller';

// SMS_SERVICE is intentionally NOT bound here anymore (V2-T2): this dev-only
// controller now gets it from the global SmsModule like everything else
// (Twilio if creds are set, Noop logging otherwise) instead of forcing a
// local unconditional TwilioSmsService that crashed dev boot without creds.
// EMAIL_SERVICE vient lui aussi du EmailModule global depuis la bascule de
// driver (Mailpit en dev, Brevo en prod).
@Module({
  imports: [ConfigModule],
  controllers: [NotificationTestController],
})
export class NotificationTestModule {}
