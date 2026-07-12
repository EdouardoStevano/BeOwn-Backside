import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthenticationController } from '../../../presenters/http/authentication.controller';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { UsersModule } from 'src/users/applications/users.module';
import { GoogleStrategy } from './strategies/google-auth.strategy';
import { FacebookAuthStrategy } from './strategies/facebook-auth.strategy';
import { LinkedinStrategy } from './strategies/linkedin-auth.strategy';
import { SignInHandler } from './commands/sign-in.handler';
import { RefreshTokenHandler } from './commands/refresh-token.handler';
import { SocialAuthHandler } from './commands/social-auth.handler';
import { ForgotPasswordHandler } from './commands/forgot-password.handler';
import { ResetPasswordHandler } from './commands/reset-password.handler';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { BrevoEmailService } from 'src/common/email/brevo.service';
import { ConfigModule } from '@nestjs/config';
import { RegisterUseCase } from 'src/users/applications/usecases/register.usecase';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { NotificationsModule } from 'src/notifications/notifications.module';

const CommandHandlers = [
  SignInHandler,
  RefreshTokenHandler,
  SocialAuthHandler,
  ForgotPasswordHandler,
  ResetPasswordHandler,
];

@Module({
  imports: [
    CqrsModule,
    IamInfrastructureModule,
    UsersInfrastructureModule,
    UsersModule,
    ConfigModule,
    NotificationsModule,
  ],
  providers: [
    ...CommandHandlers,
    RegisterUseCase,
    RecaptchaService,
    { provide: HASHING_SERVICE, useClass: BcryptService },
    { provide: EMAIL_SERVICE, useClass: BrevoEmailService },
    GoogleStrategy,
    FacebookAuthStrategy,
    LinkedinStrategy,
  ],
  controllers: [AuthenticationController],
})
export class AuthenticationModule {}
