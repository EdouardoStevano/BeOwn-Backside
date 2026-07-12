import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from './config/jwt.config';
import otpConfig from './config/otp.config';
import appUrlsConfig from './config/app-urls.config';
import { UsersModule } from 'src/users/applications/users.module';
import { ACCESS_TOKEN_VERIFIER } from 'src/common/auth/ports/access-token-verifier.port';
import { TOKEN_SERVICE } from '../domain/ports/token.service';
import { SESSION_TOKEN_STORE } from '../domain/ports/session-token.store';
import { ONE_TIME_TOKEN_STORE } from '../domain/ports/one-time-token.store';
import { OAUTH_HANDOFF_STORE } from '../domain/ports/oauth-handoff.store';
import { OTP_SERVICE } from '../domain/ports/otp.service';
import { ACCOUNT_GATEWAY } from '../domain/ports/account.gateway';
import { JwtTokenService } from './adapters/jwt-token.service';
import { RedisTokenStore } from './adapters/redis-token.store';
import { OtplibOtpService } from './adapters/otplib-otp.service';
import { UsersAccountGateway } from './adapters/users-account.gateway';

/**
 * Tous les adapters d'IAM, branchés sur les ports du domaine.
 *
 * `@Global` : le JwtAuthGuard est enregistré comme guard global (APP_GUARD) et
 * doit pouvoir résoudre ACCESS_TOKEN_VERIFIER dans le contexte de n'importe quel
 * module qui expose un contrôleur. Sans cela, chacun des seize modules de
 * l'application devait importer ce module — un import qui n'exprimait aucune
 * dépendance métier, seulement une contrainte de l'injecteur Nest.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
    ConfigModule.forFeature(otpConfig),
    ConfigModule.forFeature(appUrlsConfig),
    // Pour l'anti-corruption layer : le gateway consomme le contrat publié de Users.
    UsersModule,
  ],
  providers: [
    RedisTokenStore,
    // Un seul adapter Redis, trois ports distincts : chaque consommateur ne
    // dépend que du rôle dont il a besoin.
    { provide: SESSION_TOKEN_STORE, useExisting: RedisTokenStore },
    { provide: ONE_TIME_TOKEN_STORE, useExisting: RedisTokenStore },
    { provide: OAUTH_HANDOFF_STORE, useExisting: RedisTokenStore },

    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: OTP_SERVICE, useClass: OtplibOtpService },
    { provide: ACCOUNT_GATEWAY, useClass: UsersAccountGateway },

    // IAM est le fournisseur du port que common/auth déclare : la dépendance
    // est inversée, `common` ne connaît plus `iam`.
    { provide: ACCESS_TOKEN_VERIFIER, useExisting: TOKEN_SERVICE },
  ],
  exports: [
    TOKEN_SERVICE,
    SESSION_TOKEN_STORE,
    ONE_TIME_TOKEN_STORE,
    OAUTH_HANDOFF_STORE,
    OTP_SERVICE,
    ACCOUNT_GATEWAY,
    ACCESS_TOKEN_VERIFIER,
  ],
})
export class IamInfrastructureModule {}
