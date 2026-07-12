import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { OtpInfrastructureModule } from 'src/iam/applications/otp/infrastructure/otp-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { SendEmailOtpHandler } from 'src/iam/applications/otp/applications/commands/send-email-otp.handler';
import { VerifyEmailOtpHandler } from 'src/iam/applications/otp/applications/commands/verify-email-otp.handler';
import { SetupTotpHandler } from 'src/iam/applications/otp/applications/commands/setup-totp.handler';
import { VerifyTotpHandler } from 'src/iam/applications/otp/applications/commands/verify-totp.handler';
import { SendSmsOtpHandler } from 'src/iam/applications/otp/applications/commands/send-sms-otp.handler';
import { VerifySmsOtpHandler } from 'src/iam/applications/otp/applications/commands/verify-sms-otp.handler';
import { OtpController } from 'src/iam/presenters/otp/http/otp.controller';
import { IamModule } from 'src/iam/iam.module';

const CommandHandlers = [
  SendEmailOtpHandler,
  VerifyEmailOtpHandler,
  SetupTotpHandler,
  VerifyTotpHandler,
  SendSmsOtpHandler,
  VerifySmsOtpHandler,
];

@Module({
  imports: [
    CqrsModule,
    OtpInfrastructureModule,
    UsersInfrastructureModule,
    forwardRef(() => IamModule),
  ],
  providers: [...CommandHandlers],
  controllers: [OtpController],
})
export class OtpModule {}
