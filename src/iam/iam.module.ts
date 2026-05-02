import { Module } from '@nestjs/common';
import { AuthenticationModule } from './authentication/application/authentication.module';
import { OtpModule } from './authentication/application/otp.module';
import { UsersInfrastructureModule } from 'src/users/infrastructures/users-infrastructure.module';
import { VerifyEmailService } from './verify-email/verify-email.service';
import { VerifyEmailController } from './verify-email/verify-email.controller';
import { SMS_SERVICE } from 'src/common/sms/sms.service';
import { TwilioSmsService } from 'src/common/sms/twilio-sms.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    AuthenticationModule,
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
