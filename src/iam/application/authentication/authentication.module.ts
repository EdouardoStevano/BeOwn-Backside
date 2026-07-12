import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from 'src/iam/infrastructure/config/jwt.config';
import appUrlsConfig from 'src/iam/infrastructure/config/app-urls.config';
import { AuthenticationController } from 'src/iam/presenters/http/authentication.controller';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { CAPTCHA_VERIFIER } from 'src/iam/domain/ports/captcha.verifier';
import { RecaptchaVerifier } from 'src/iam/infrastructure/adapters/recaptcha.verifier';
import { GoogleStrategy } from 'src/iam/infrastructure/strategies/google-auth.strategy';
import { FacebookAuthStrategy } from 'src/iam/infrastructure/strategies/facebook-auth.strategy';
import { LinkedinStrategy } from 'src/iam/infrastructure/strategies/linkedin-auth.strategy';
import { SignInHandler } from './commands/sign-in.handler';
import { SignUpHandler } from './commands/sign-up.handler';
import { RefreshTokenHandler } from './commands/refresh-token.handler';
import { SocialAuthHandler } from './commands/social-auth.handler';
import { ForgotPasswordHandler } from './commands/forgot-password.handler';
import { ResetPasswordHandler } from './commands/reset-password.handler';
import { ExchangeOAuthCodeHandler } from './queries/exchange-oauth-code.handler';

const CommandHandlers = [
  SignInHandler,
  SignUpHandler,
  RefreshTokenHandler,
  SocialAuthHandler,
  ForgotPasswordHandler,
  ResetPasswordHandler,
];

const QueryHandlers = [ExchangeOAuthCodeHandler];

/**
 * Les ports (TOKEN_SERVICE, ACCOUNT_GATEWAY, stores…) viennent de
 * IamInfrastructureModule, qui est global. Ne restent ici que les use cases et
 * les adapters propres à l'authentification.
 */
@Module({
  imports: [
    CqrsModule,
    // ForgotPasswordHandler injecte jwtConfig.KEY (TTL du lien de reset) et le
    // contrôleur appUrlsConfig.KEY : forFeature n'est pas transitif, il faut les
    // déclarer ici aussi.
    ConfigModule.forFeature(jwtConfig),
    ConfigModule.forFeature(appUrlsConfig),
  ],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    RecaptchaService,
    { provide: CAPTCHA_VERIFIER, useClass: RecaptchaVerifier },
    GoogleStrategy,
    FacebookAuthStrategy,
    LinkedinStrategy,
  ],
  controllers: [AuthenticationController],
})
export class AuthenticationModule {}
