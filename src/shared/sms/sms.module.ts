import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SMS_SERVICE, SmsService } from './sms.service';
import { TwilioSmsService } from './twilio-sms.service';
import { NoopSmsService } from './noop-sms.service';

/**
 * Selects the SMS sender for the whole app: TwilioSmsService when the three
 * required env vars are present, NoopSmsService otherwise (dev/CI without
 * Twilio creds — logs the intent instead of sending, never throws).
 *
 * Exported standalone (rather than inlined in the @Module useFactory) so it
 * can be unit-tested directly against a mocked ConfigService without
 * bootstrapping Nest's DI container (see sms.module.spec.ts).
 */
export function smsServiceFactory(config: ConfigService): SmsService {
  const accountSid = config.get<string>('TWILIO_ACCOUNT_SID');
  const authToken = config.get<string>('TWILIO_AUTH_TOKEN');
  const fromNumber = config.get<string>('TWILIO_PHONE_NUMBER');

  if (accountSid && authToken && fromNumber) {
    return new TwilioSmsService(config);
  }

  return new NoopSmsService();
}

/**
 * Global, single source of truth for SMS_SERVICE across the app (signup OTP,
 * 2FA login OTP, dev test endpoint…). Lives in `shared/` because the port is
 * a pure transport contract — a number, a message — carrying no vocabulary
 * from the contexts that call it. @Global() so every feature module gets
 * it without re-importing or re-binding the token locally — module-local
 * SMS_SERVICE bindings should NOT be reintroduced elsewhere, they would
 * silently shadow this one for their own injector scope.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SMS_SERVICE,
      useFactory: smsServiceFactory,
      inject: [ConfigService],
    },
  ],
  exports: [SMS_SERVICE],
})
export class SmsModule {}
