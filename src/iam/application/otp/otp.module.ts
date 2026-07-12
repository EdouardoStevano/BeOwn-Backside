import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';
import otpConfig from 'src/iam/infrastructure/config/otp.config';
import { OtpController } from 'src/iam/presenters/http/otp.controller';
import {
  SendEmailOtpHandler,
  VerifyEmailOtpHandler,
} from './commands/email-otp.handlers';
import {
  SendSmsOtpHandler,
  VerifySmsOtpHandler,
} from './commands/sms-otp.handlers';
import { SetupTotpHandler, VerifyTotpHandler } from './commands/totp.handlers';

const CommandHandlers = [
  SendEmailOtpHandler,
  VerifyEmailOtpHandler,
  SendSmsOtpHandler,
  VerifySmsOtpHandler,
  SetupTotpHandler,
  VerifyTotpHandler,
];

/**
 * Plus de forwardRef vers IamModule : SMS_SERVICE et EMAIL_SERVICE viennent
 * désormais de modules globaux (SmsModule, EmailModule), et les ports d'IAM du
 * IamInfrastructureModule global. Le cycle IamModule ⇄ OtpModule disparaît.
 */
@Module({
  // forFeature n'est pas transitif : le module qui injecte otpConfig.KEY doit
  // le déclarer lui-même, même si IamInfrastructureModule le fait déjà.
  imports: [CqrsModule, ConfigModule.forFeature(otpConfig)],
  providers: [...CommandHandlers],
  controllers: [OtpController],
})
export class OtpModule {}
