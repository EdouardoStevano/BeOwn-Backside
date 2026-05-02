import { Module } from '@nestjs/common';
import { AuthenticationModule } from './authentication/application/authentication.module';
import { UsersInfrastructureModule } from 'src/users/infrastructures/users-infrastructure.module';
import { VerifyEmailService } from './verify-email/verify-email.service';
import { VerifyEmailController } from './verify-email/verify-email.controller';
import { SMS_SERVICE } from 'src/common/sms/sms.service';
import { TwilioSmsService } from 'src/common/sms/twilio-sms.service';
import { ConfigModule } from '@nestjs/config';
import { EmailVerificationModule } from './email-verification/email-verification.module';
import { TfaModule } from './tfa/tfa.module';
import { IamInfrastructureModule } from './infrastructure/iam-infrastructure.module';

@Module({
  imports: [
    IamInfrastructureModule,
    AuthenticationModule,
    UsersInfrastructureModule,
    ConfigModule,
    AuthenticationModule, EmailVerificationModule, TfaModule
  ],
  providers: [
    VerifyEmailService,
    { provide: SMS_SERVICE, useClass: TwilioSmsService },
  ],
  controllers: [VerifyEmailController],
  exports: [SMS_SERVICE],
})
@Module({
  imports: [],
})
export class IamModule {}
