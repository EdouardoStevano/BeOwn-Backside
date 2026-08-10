import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { UsersModule } from 'src/iam/applications/users/users.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { GoogleStrategy } from 'src/iam/infrastructure/oauth/strategies/google-auth.strategy';
import { FacebookAuthStrategy } from 'src/iam/infrastructure/oauth/strategies/facebook-auth.strategy';
import { LinkedinStrategy } from 'src/iam/infrastructure/oauth/strategies/linkedin-auth.strategy';
import { AuthenticationController } from 'src/iam/presenters/http/authentication.controller';
import { RegisterUseCase } from './usecases/register.usecase';
import { SignInUsecase } from './usecases/sign-in.usecase';
import { RefreshTokenUseCase } from './usecases/refresh-token.usecase';
import { SocialAuthUseCase } from './usecases/social-auth.usecase';
import { IssueOAuthCodeUseCase } from './usecases/issue-oauth-code.usecase';
import { ExchangeOAuthCodeUseCase } from './usecases/exchange-oauth-code.usecase';
import { ForgotPasswordUseCase } from './usecases/forgot-password.usecase';
import { ResetPasswordUseCase } from './usecases/reset-password.usecase';
import { EmailVerificationModule } from '../email-verification/email-verification.module';

@Module({
  imports: [
    IamInfrastructureModule,
    UsersInfrastructureModule,
    UsersModule,
    ConfigModule,
    NotificationsModule,
    // Fournit SendEmailVerificationUseCase à RegisterUseCase : le sign-up
    // envoie le lien de vérification dans la foulée de la création du compte.
    EmailVerificationModule,
  ],
  providers: [
    SignInUsecase,
    RefreshTokenUseCase,
    SocialAuthUseCase,
    IssueOAuthCodeUseCase,
    ExchangeOAuthCodeUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    RegisterUseCase,
    RecaptchaService,
    { provide: HASHING_SERVICE, useClass: BcryptService },
    GoogleStrategy,
    FacebookAuthStrategy,
    LinkedinStrategy,
  ],
  controllers: [AuthenticationController],
  exports: [ForgotPasswordUseCase, ResetPasswordUseCase],
})
export class AuthenticationModule {}
