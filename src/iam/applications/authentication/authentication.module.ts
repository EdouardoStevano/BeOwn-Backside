import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { UsersModule } from 'src/iam/applications/users/users.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { TFAMethodEntity } from 'src/iam/infrastructure/persistence/entities/tfa-method.entity';
import { TOTPMethodEntity } from 'src/iam/infrastructure/persistence/entities/totp-method.entity';
import { EmailMethodEntity } from 'src/iam/infrastructure/persistence/entities/email-method.entity';
import { SMSMethodEntity } from 'src/iam/infrastructure/persistence/entities/sms-method.entity';
import { AUTH_MAILER } from 'src/iam/domains/ports/auth-mailer.port';
import { OTP_STORE } from 'src/iam/domains/ports/otp-store.port';
import { TOTP_GENERATOR } from 'src/iam/domains/ports/totp-generator.port';
import { TOTP_METHOD_REPOSITORY } from 'src/iam/domains/ports/totp-method.repository';
import {
  EMAIL_METHOD_REPOSITORY,
  SMS_METHOD_REPOSITORY,
} from 'src/iam/domains/ports/channel-tfa-method.repository';
import { SECRET_CIPHER } from 'src/iam/domains/ports/secret-cipher.port';
import { NestAuthMailerAdapter } from 'src/iam/infrastructure/mailer/nest-auth-mailer.adapter';
import { RedisOtpStoreAdapter } from 'src/iam/infrastructure/otp/redis-otp-store.adapter';
import { OtplibTotpGeneratorAdapter } from 'src/iam/infrastructure/otp/otplib-totp-generator.adapter';
import { TypeOrmTotpMethodRepository } from 'src/iam/infrastructure/persistence/repositories/typeorm-totp-method.repository';
import { TypeOrmEmailMethodRepository } from 'src/iam/infrastructure/persistence/repositories/typeorm-email-method.repository';
import { TypeOrmSmsMethodRepository } from 'src/iam/infrastructure/persistence/repositories/typeorm-sms-method.repository';
import { AesGcmSecretCipherAdapter } from 'src/iam/infrastructure/crypto/aes-gcm-secret-cipher.adapter';
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
import { SendEmailVerificationUseCase } from './usecases/send-email-verification.usecase';
import { ConfirmEmailUseCase } from './usecases/confirm-email.usecase';
import { CreateEmailOtpUseCase } from './usecases/create-email-otp.usecase';
import { CreateSmsOtpUseCase } from './usecases/create-sms-otp.usecase';
import { EnrollTfaUseCase } from './usecases/enroll-tfa.usecase';
import { TFA_ENROLLMENT_STRATEGIES } from './enrollment/tfa-enrollment.strategy';
import { TotpEnrollmentStrategy } from './enrollment/totp-enrollment.strategy';
import { EmailEnrollmentStrategy } from './enrollment/email-enrollment.strategy';
import { SmsEnrollmentStrategy } from './enrollment/sms-enrollment.strategy';

/**
 * Feature « authentification » du Bounded Context IAM : tout ce qui prouve
 * l'identité d'un porteur de compte — mot de passe, OAuth social, vérification
 * d'adresse email, OTP de connexion et 2FA.
 *
 * Ces trois sujets vivaient dans trois modules distincts
 * (`AuthenticationModule`, `EmailVerificationModule`, `OtpModule`) alors qu'ils
 * changent pour la même raison et partagent le même vocabulaire (utilisateur,
 * token, mailer, statut de compte) : le sign-up déclenchait déjà l'envoi du
 * lien de vérification, et `AUTH_MAILER` était relié deux fois, une fois par
 * module. Les réunir ici applique CCP (§5) ; la frontière qui compte reste
 * celle du contexte IAM, pas celle du parcours.
 *
 * Deux points d'histoire, à ne pas défaire :
 * - `SMS_SERVICE` n'est **pas** relié ici : il vient du `SmsModule` global
 *   (importé une seule fois par AppModule). Un binding local masquerait ce
 *   provider et ferait revenir le crash au démarrage quand les identifiants
 *   Twilio sont absents.
 * - Toute la hiérarchie STI des méthodes 2FA est déclarée ici, et non dans
 *   `IamInfrastructureModule` : ce dernier reste limité aux tokens et au cache
 *   dont dépendent les ~23 modules à contrôleur authentifié (CRP, §5). La
 *   classe parente `TFAMethodEntity` doit figurer dans les métadonnées pour que
 *   les `@ChildEntity` se résolvent.
 */
@Module({
  imports: [
    IamInfrastructureModule,
    UsersInfrastructureModule,
    UsersModule,
    ConfigModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      TFAMethodEntity,
      TOTPMethodEntity,
      EmailMethodEntity,
      SMSMethodEntity,
    ]),
  ],
  providers: [
    // Adapters de sortie (§4 — DIP : le domaine définit le port, l'infra le
    // remplit ; le câblage vit à la racine de la feature).
    { provide: HASHING_SERVICE, useClass: BcryptService },
    { provide: AUTH_MAILER, useClass: NestAuthMailerAdapter },
    { provide: OTP_STORE, useClass: RedisOtpStoreAdapter },
    { provide: TOTP_GENERATOR, useClass: OtplibTotpGeneratorAdapter },
    { provide: TOTP_METHOD_REPOSITORY, useClass: TypeOrmTotpMethodRepository },
    // Deux tokens, un seul contrat `ChannelTfaMethodRepository` : les canaux
    // email et SMS ont le même cycle de vie, seule la colonne de destination
    // change (§4 — DIP/LSP).
    {
      provide: EMAIL_METHOD_REPOSITORY,
      useClass: TypeOrmEmailMethodRepository,
    },
    { provide: SMS_METHOD_REPOSITORY, useClass: TypeOrmSmsMethodRepository },
    { provide: SECRET_CIPHER, useClass: AesGcmSecretCipherAdapter },

    // Stratégies Passport des fournisseurs OAuth.
    GoogleStrategy,
    FacebookAuthStrategy,
    LinkedinStrategy,

    // Canaux d'enrôlement 2FA (§9 — Strategy).
    TotpEnrollmentStrategy,
    EmailEnrollmentStrategy,
    SmsEnrollmentStrategy,
    // Registre des canaux enrôlables : c'est le seul endroit à modifier pour
    // en ajouter un — ni le contrôleur ni `EnrollTfaUseCase` ne bougent.
    {
      provide: TFA_ENROLLMENT_STRATEGIES,
      useFactory: (
        totp: TotpEnrollmentStrategy,
        email: EmailEnrollmentStrategy,
        sms: SmsEnrollmentStrategy,
      ) => [totp, email, sms],
      inject: [
        TotpEnrollmentStrategy,
        EmailEnrollmentStrategy,
        SmsEnrollmentStrategy,
      ],
    },

    // Use cases — connexion / inscription / mot de passe.
    RegisterUseCase,
    SignInUsecase,
    RefreshTokenUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    RecaptchaService,

    // Use cases — OAuth social.
    SocialAuthUseCase,
    IssueOAuthCodeUseCase,
    ExchangeOAuthCodeUseCase,

    // Use cases — vérification d'adresse email.
    SendEmailVerificationUseCase,
    ConfirmEmailUseCase,

    // Use cases — OTP de connexion et enrôlement 2FA.
    CreateEmailOtpUseCase,
    CreateSmsOtpUseCase,
    EnrollTfaUseCase,
  ],
  controllers: [AuthenticationController],
})
export class AuthenticationModule {}
