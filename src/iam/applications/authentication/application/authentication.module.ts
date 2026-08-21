import { Module, forwardRef } from '@nestjs/common';
import { SignInUsecase } from './usecases/sign-in.usecase';
import { VerifyTwoFactorUseCase } from './usecases/verify-two-factor.usecase';
import { OtpModule } from './otp.module';
import { AuthenticationController } from '../../../presenters/http/authentication.controller';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { RefreshTokenUseCase } from './usecases/refresh-token.usecase';
import { UsersModule } from 'src/users/applications/users.module';
import { GoogleStrategy } from './strategies/google-auth.strategy';
import { LinkedinStrategy } from './strategies/linkedin-auth.strategy';
import { SocialAuthUseCase } from './usecases/social-auth.usecase';
import { ForgotPasswordUseCase } from './usecases/forgot-password.usecase';
import { ResetPasswordUseCase } from './usecases/reset-password.usecase';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { BrevoEmailService } from 'src/common/email/brevo.service';
import { ConfigModule } from '@nestjs/config';
import { RegisterUseCase } from 'src/users/applications/usecases/register.usecase';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { RegistrationOtpModule } from './registration-otp.module';

@Module({
  imports: [
    IamInfrastructureModule,
    UsersInfrastructureModule,
    UsersModule,
    ConfigModule,
    NotificationsModule,
    RegistrationOtpModule,
    // forwardRef : OtpModule référence déjà IamModule, qui importe ce module.
    forwardRef(() => OtpModule),
  ],
  providers: [
    SignInUsecase,
    VerifyTwoFactorUseCase,
    RefreshTokenUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    RegisterUseCase,
    RecaptchaService,
    { provide: HASHING_SERVICE, useClass: BcryptService },
    { provide: EMAIL_SERVICE, useClass: BrevoEmailService },
    GoogleStrategy,
    LinkedinStrategy,
    SocialAuthUseCase,
  ],
  controllers: [AuthenticationController],
  exports: [ForgotPasswordUseCase, ResetPasswordUseCase],
})
export class AuthenticationModule {}
