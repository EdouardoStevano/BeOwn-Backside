import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import jwtConfig from 'src/iam/infrastructure/configuration/jwt.config';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { UsersModule } from 'src/iam/application/users.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { HASHING_SERVICE } from 'src/iam/domain/ports/hashing.service';
import { BcryptService } from 'src/iam/infrastructure/crypto/bcrypt.service';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { OTP_RECORD_STORE } from 'src/iam/application/ports/otp-record-store.port';
import { TOTP_GENERATOR } from 'src/iam/application/ports/totp-generator.port';
import { SECRET_CIPHER } from 'src/iam/application/ports/secret-cipher.port';
import { CacheOtpRecordStoreAdapter } from 'src/iam/infrastructure/otp/cache-otp-record-store.adapter';
import { OtplibTotpGeneratorAdapter } from 'src/iam/infrastructure/otp/otplib-totp-generator.adapter';
import { AesGcmSecretCipherAdapter } from 'src/iam/infrastructure/crypto/aes-gcm-secret-cipher.adapter';
import { GoogleStrategy } from 'src/iam/infrastructure/oauth/strategies/google-auth.strategy';
import { FacebookAuthStrategy } from 'src/iam/infrastructure/oauth/strategies/facebook-auth.strategy';
import { LinkedinStrategy } from 'src/iam/infrastructure/oauth/strategies/linkedin-auth.strategy';
import { AuthenticationController } from 'src/iam/presentation/http/authentication.controller';
import { RegisterUseCase } from './usecases/sign/register.usecase';
import { SignInUsecase } from './usecases/sign/sign-in.usecase';
import { RefreshTokenUseCase } from './usecases/token/refresh-token.usecase';
import { SocialAuthUseCase } from './usecases/oauth/social-auth.usecase';
import { IssueOAuthCodeUseCase } from './usecases/oauth/issue-oauth-code.usecase';
import { ExchangeOAuthCodeUseCase } from './usecases/oauth/exchange-oauth-code.usecase';
import { ForgotPasswordUseCase } from './usecases/password/forgot-password.usecase';
import { ResetPasswordUseCase } from './usecases/password/reset-password.usecase';
import { SendEmailVerificationUseCase } from './usecases/email/send-email-verification.usecase';
import { ConfirmEmailUseCase } from './usecases/email/confirm-email.usecase';
import { EnrollMfaUseCase } from './usecases/mfa/enroll-mfa.usecase';
import { ListMfaMethodsUseCase } from './usecases/mfa/list-mfa-methods.usecase';
import { MFA_ENROLLMENT_STRATEGIES } from './strategies/mfa/mfa-enrollment.strategy';
import { TotpEnrollmentStrategy } from './strategies/totp/totp-enrollment.strategy';
import { EmailEnrollmentStrategy } from './strategies/email/email-enrollment.strategy';
import { SmsEnrollmentStrategy } from './strategies/sms/sms-enrollment.strategy';
import { MFA_CHALLENGE_STRATEGIES } from './strategies/mfa/mfa-challenge.strategy';
import { TotpChallengeStrategy } from './strategies/totp/totp-challenge.strategy';
import { EmailChallengeStrategy } from './strategies/email/email-challenge.strategy';
import { SmsChallengeStrategy } from './strategies/sms/sms-challenge.strategy';
import { MfaFactorService } from './services/mfa/mfa-factor.service';
import { TokenEmailCacheService } from './services/token/token-email-cache.service';
import { UserRegisteredEventHandler } from './handlers/user-registered.event-handler';
import { EnableMfaUseCase } from './usecases/mfa/enable-mfa.usecase';
import { DisableMfaUseCase } from './usecases/mfa/disable-mfa.usecase';
import { VerifyMfaChallengeUseCase } from './usecases/mfa/verify-mfa-challenge.usecase';
import { CompleteMfaSignInUseCase } from './usecases/mfa/complete-mfa-sign-in.usecase';
import { ResendMfaChallengeUseCase } from './usecases/mfa/resend-mfa-challenge.usecase';
import { MFAChallengeCacheService } from './services/mfa/mfa-challenge-cache.service';
import { OtpService } from './services/otp/otp.service';
import { AuthMailerService } from './services/auth-mailer.service';
import { TotpSecretService } from './services/totp/totp-secret.service';

/**
 * Feature « authentification » du Bounded Context IAM : tout ce qui prouve
 * l'identité d'un porteur de compte — mot de passe, OAuth social, vérification
 * d'adresse email et double authentification.
 *
 * Ces trois sujets vivaient dans trois modules distincts
 * (`AuthenticationModule`, `EmailVerificationModule`, `OtpModule`) alors qu'ils
 * changent pour la même raison et partagent le même vocabulaire (utilisateur,
 * token, mailer, statut de compte) : le sign-up déclenchait déjà l'envoi du
 * lien de vérification, et `AUTH_MAILER` était relié deux fois, une fois par
 * module. Les réunir ici applique CCP (§5) ; la frontière qui compte reste
 * celle du contexte IAM, pas celle du parcours.
 *
 * Les classes de la couche sont rangées par type — `applications/usecases/`,
 * `applications/services/`, `applications/strategies/`, `applications/ports/`
 * — puis, dans les deux dossiers qui le méritaient, par sujet :
 * `services/{mfa,otp,totp,token}/` et `strategies/{mfa,channel,email,sms,totp}/`.
 * Les use cases restent à plat, leur nom suffisant à dire de quel parcours ils
 * relèvent. Les modules qui câblent le tout, celui-ci et `users.module.ts`,
 * vivent à la racine d'`applications/` : ajouter un use case veut donc dire
 * toucher `usecases/` puis ce fichier.
 *
 * Deux points d'histoire, à ne pas défaire :
 * - `SMS_SERVICE` n'est **pas** relié ici : il vient du `SmsModule` global
 *   (importé une seule fois par AppModule). Un binding local masquerait ce
 *   provider et ferait revenir le crash au démarrage quand les identifiants
 *   Twilio sont absents.
 * - `MfaMethodEntity` n'est plus déclarée ici : les facteurs sont des entités
 *   de l'agrégat `User`, chargées et sauvegardées par son repository. Elle
 *   suit donc `UsersInfrastructureModule`, avec la racine qui les porte.
 */
@Module({
  imports: [
    IamInfrastructureModule,
    UsersInfrastructureModule,
    UsersModule,
    ConfigModule,
    // `TokenEmailCacheService` lit `emailTokenTtl` : la config JWT doit être
    // enregistrée ici aussi, `IamInfrastructureModule` ne la ré-exportant pas.
    ConfigModule.forFeature(jwtConfig),
    NotificationsModule,
    // Bus d'événements : `RegisterUseCase` publie un Domain Event, dont les
    // abonnés vivent dans `applications/events/` (§8).
    CqrsModule,
  ],
  providers: [
    // Adapters de sortie (§4 — DIP : le port est déclaré du côté qui exprime
    // le besoin, l'infra le remplit ; le câblage vit à la racine
    // d'`applications/`). Les repositories restent des ports du **domaine** —
    // ils décrivent l'accès aux agrégats ; les contrats d'outillage (JWT,
    // mailer, chiffrement, stores à TTL) sont des ports de l'**application**,
    // dans `applications/ports/`.
    { provide: HASHING_SERVICE, useClass: BcryptService },
    { provide: OTP_RECORD_STORE, useClass: CacheOtpRecordStoreAdapter },

    // Caches propres à cette feature : identifiants des tokens email, et OTP
    // en attente de saisie. Le cache de sessions vient d IamInfrastructureModule.
    TokenEmailCacheService,
    // Politique des OTP (tirage, durée, plafond d'essais) : un service, pas un
    // port — elle ne change pas quand le magasin change.
    OtpService,
    { provide: TOTP_GENERATOR, useClass: OtplibTotpGeneratorAdapter },
    // Un seul token pour les trois canaux. Il y en avait trois
    // (`TOTP_METHOD_REPOSITORY`, `EMAIL_METHOD_REPOSITORY`,
    // `SMS_METHOD_REPOSITORY`) pour deux contrats et quatre adapters, dont le
    // seul rôle était de choisir la table fille à interroger. Le canal étant
    // devenu une colonne, il est passé en paramètre (§4 — DIP/LSP).
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
    // en ajouter un — ni le contrôleur ni `EnrollMfaUseCase` ne bougent.
    {
      provide: MFA_ENROLLMENT_STRATEGIES,
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

    // Use cases — enrôlement du second facteur.
    EnrollMfaUseCase,
    ListMfaMethodsUseCase,

    // Canaux de vérification MFA (§9 — Strategy). Famille distincte de
    // l'enrôlement : celle-ci éprouve un facteur **déjà actif**, l'autre en
    // installe un nouveau (ISP, §4).
    TotpChallengeStrategy,
    EmailChallengeStrategy,
    SmsChallengeStrategy,
    {
      provide: MFA_CHALLENGE_STRATEGIES,
      useFactory: (
        totp: TotpChallengeStrategy,
        email: EmailChallengeStrategy,
        sms: SmsChallengeStrategy,
      ) => [totp, email, sms],
      inject: [
        TotpChallengeStrategy,
        EmailChallengeStrategy,
        SmsChallengeStrategy,
      ],
    },
    MfaFactorService,

    // Challenges MFA : contexte d'une preuve attendue, à TTL et essais bornés.
    MFAChallengeCacheService,

    // Compositions qui ne dépendent d'aucun driver : ce que dit un email
    // d'authentification, et sous quel émetteur un secret TOTP s'enrôle. Elles
    // vivaient dans les adapters, où un second transport ou un second
    // générateur les aurait recopiées.
    AuthMailerService,
    TotpSecretService,

    // Use cases — cycle de vie du second facteur.
    EnableMfaUseCase,
    DisableMfaUseCase,
    // Éprouver un code n'est exposé par aucune route : c'est une brique dont
    // dépendent les deux use cases qui *agissent* sur la preuve — ouvrir une
    // session (`POST /auth/sign-in/mfa`) et retirer un facteur
    // (`POST /auth/mfa/disable`) — pour qu'ils vérifient de la même façon.
    VerifyMfaChallengeUseCase,
    CompleteMfaSignInUseCase,
    // Renvoyer un code ne rejoue pas le défi : il reste tel quel, seul l'OTP
    // du canal est réémis.
    ResendMfaChallengeUseCase,

    // Abonnés aux Domain Events de la feature.
    UserRegisteredEventHandler,
  ],
  controllers: [AuthenticationController],
})
export class AuthenticationModule {}
