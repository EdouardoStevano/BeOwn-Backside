import { Module, forwardRef } from '@nestjs/common';
import { IamInfrastructureModule } from './infrastructure/iam-infrastructure.module';
import { AuthenticationModule } from './applications/authentication/application/authentication.module';
import { OtpModule } from './applications/authentication/application/otp.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { VerifyEmailService } from './applications/verify-email/verify-email.service';
import { VerifyEmailController } from './applications/verify-email/verify-email.controller';
import { SMS_SERVICE } from 'src/common/sms/sms.service';
import { TwilioSmsService } from 'src/common/sms/twilio-sms.service';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { NodemailerMailService } from 'src/common/email/nodemailer.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    IamInfrastructureModule,
    AuthenticationModule,
    forwardRef(() => OtpModule),
    UsersInfrastructureModule,
    ConfigModule,
  ],
  providers: [
    VerifyEmailService,
    { provide: SMS_SERVICE, useClass: TwilioSmsService },
    { provide: EMAIL_SERVICE, useClass: NodemailerMailService },
  ],
  controllers: [VerifyEmailController],
  exports: [SMS_SERVICE, IamInfrastructureModule],
})
export class IamModule {}
