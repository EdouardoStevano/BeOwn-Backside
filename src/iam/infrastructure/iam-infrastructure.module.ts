import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from './config/jwt.config';
import otpConfig from './config/otp.config';
import registrationOtpConfig from './config/registration-otp.config';
import appUrlsConfig from './config/app-urls.config';
import { UsersModule } from 'src/users/applications/users.module';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { ACCESS_TOKEN_VERIFIER } from 'src/common/auth/ports/access-token-verifier.port';
import { TOKEN_SERVICE } from '../domain/ports/token.service';
import { SESSION_TOKEN_STORE } from '../domain/ports/session-token.store';
import { ONE_TIME_TOKEN_STORE } from '../domain/ports/one-time-token.store';
import { OAUTH_HANDOFF_STORE } from '../domain/ports/oauth-handoff.store';
import { OTP_SERVICE } from '../domain/ports/otp.service';
import { REGISTRATION_OTP_STORE } from '../domain/ports/registration-otp.store';
import { PHONE_DIRECTORY } from '../domain/ports/phone.directory';
import { ACCOUNT_GATEWAY } from '../domain/ports/account.gateway';
import { TWO_FACTOR_GATEWAY } from '../domain/ports/two-factor.gateway';
import { JwtTokenService } from './adapters/jwt-token.service';
import { RedisTokenStore } from './adapters/redis-token.store';
import { OtplibOtpService } from './adapters/otplib-otp.service';
import { RedisRegistrationOtpStore } from './adapters/redis-registration-otp.store';
import { ProfilesPhoneDirectory } from './adapters/profiles-phone.directory';
import { UsersAccountGateway } from './adapters/users-account.gateway';
import { UsersTwoFactorGateway } from './adapters/users-two-factor.gateway';

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
    ConfigModule.forFeature(registrationOtpConfig),
    ConfigModule.forFeature(appUrlsConfig),
    // Pour les anti-corruption layers : le gateway consomme le contrat publié
    // de Users, l'annuaire téléphonique le repository de Profiles.
    UsersModule,
    ProfilesInfrastructureModule,
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
    { provide: REGISTRATION_OTP_STORE, useClass: RedisRegistrationOtpStore },
    { provide: PHONE_DIRECTORY, useClass: ProfilesPhoneDirectory },
    { provide: ACCOUNT_GATEWAY, useClass: UsersAccountGateway },
    { provide: TWO_FACTOR_GATEWAY, useClass: UsersTwoFactorGateway },

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
    REGISTRATION_OTP_STORE,
    PHONE_DIRECTORY,
    ACCOUNT_GATEWAY,
    TWO_FACTOR_GATEWAY,
    ACCESS_TOKEN_VERIFIER,
  ],
})
export class IamInfrastructureModule {}
