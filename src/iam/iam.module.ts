import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from './infrastructure/iam-infrastructure.module';
import { AuthenticationModule } from './applications/authentication/application/authentication.module';
import { OtpModule } from './applications/authentication/application/otp.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { VerifyEmailService } from './applications/verify-email/verify-email.service';
import { VerifyEmailController } from './applications/verify-email/verify-email.controller';
import { SMS_SERVICE } from 'src/common/sms/sms.service';
import { TwilioSmsService } from 'src/common/sms/twilio-sms.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    IamInfrastructureModule,
    AuthenticationModule,
    OtpModule,
    UsersInfrastructureModule,
    ConfigModule,
  ],
  providers: [
    VerifyEmailService,
    { provide: SMS_SERVICE, useClass: TwilioSmsService },
  ],
  controllers: [VerifyEmailController],
  exports: [SMS_SERVICE],
})
export class IamModule {}
