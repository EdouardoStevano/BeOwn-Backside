import { Module } from '@nestjs/common';
import { SignInUsecase } from './usecases/sign-in.usecase';
import { AuthenticationController } from '../../../presenters/http/authentication.controller';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { RefreshTokenUseCase } from './usecases/refresh-token.usecase';
import { UsersModule } from 'src/users/applications/users.module';
import { GoogleStrategy } from './strategies/google-auth.strategy';
import { FacebookAuthStrategy } from './strategies/facebook-auth.strategy';
import { LinkedinStrategy } from './strategies/linkedin-auth.strategy';
import { SocialAuthUseCase } from './usecases/social-auth.usecase';
import { ForgotPasswordUseCase } from './usecases/forgot-password.usecase';
import { ResetPasswordUseCase } from './usecases/reset-password.usecase';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { BrevoEmailService } from 'src/common/email/brevo.service';
import { ConfigModule } from '@nestjs/config';
import { RegisterUseCase } from 'src/users/applications/usecases/register.usecase';

@Module({
  imports: [
    IamInfrastructureModule,
    UsersInfrastructureModule,
    UsersModule,
    ConfigModule,
  ],
  providers: [
    SignInUsecase,
    RefreshTokenUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    RegisterUseCase,
    { provide: HASHING_SERVICE, useClass: BcryptService },
    { provide: EMAIL_SERVICE, useClass: BrevoEmailService },
    GoogleStrategy,
    FacebookAuthStrategy,
    LinkedinStrategy,
    SocialAuthUseCase,
  ],
  controllers: [AuthenticationController],
  exports: [ForgotPasswordUseCase, ResetPasswordUseCase],
})
export class AuthenticationModule {}
