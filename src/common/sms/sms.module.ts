import { Global, Module } from '@nestjs/common';
import { SMS_SERVICE } from './sms.service';
import { TwilioSmsService } from './twilio-sms.service';

/**
 * Binding unique du port SMS_SERVICE. C'est ce module qui remplace le
 * forwardRef circulaire IamModule ⇄ OtpModule, dont la seule raison d'être
 * était de propager SMS_SERVICE jusqu'aux handlers OTP.
 */
@Global()
@Module({
  providers: [{ provide: SMS_SERVICE, useClass: TwilioSmsService }],
  exports: [SMS_SERVICE],
})
export class SmsModule {}
