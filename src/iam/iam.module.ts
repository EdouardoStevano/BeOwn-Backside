import { Module, forwardRef } from '@nestjs/common';
import { IamInfrastructureModule } from './infrastructure/iam-infrastructure.module';
import { AuthenticationModule } from './applications/authentication/application/authentication.module';
import { OtpModule } from './applications/authentication/application/otp.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { VerifyEmailService } from './applications/verify-email/verify-email.service';
import { VerifyEmailController } from './applications/verify-email/verify-email.controller';
import { TOKEN_SERVICE } from './domains/ports/token.service';
import { ConfigModule } from '@nestjs/config';

// SMS_SERVICE used to be bound here (unconditional TwilioSmsService, for the
// 2FA/login SMS OTP flow). V2-T2 moved it to the global SmsModule (imported
// once in AppModule) so the whole app shares one sender with a Noop fallback
// when Twilio creds are absent — binding it again here would shadow that
// global provider for OtpModule (imported below via forwardRef) and bring
// back the "crashes on boot without Twilio creds" behaviour.
@Module({
  imports: [
    IamInfrastructureModule,
    AuthenticationModule,
    forwardRef(() => OtpModule),
    UsersInfrastructureModule,
    ConfigModule,
  ],
  providers: [VerifyEmailService],
  controllers: [VerifyEmailController],
  exports: [IamInfrastructureModule],
})
export class IamModule {}
