import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { IamErrorFilter } from './presenters/http/filters/iam-error.filter';
import { IamInfrastructureModule } from './infrastructure/iam-infrastructure.module';
import { AuthenticationModule } from './applications/authentication.module';
import { UsersModule } from './applications/users.module';

/**
 * Façade du Bounded Context IAM : agrège ses features et ne réexporte que le
 * noyau d'infrastructure (tokens + cache) dont dépendent les autres contextes.
 *
 * Le contexte ne compte plus que deux features : `AuthenticationModule`
 * (prouver l'identité — mot de passe, OAuth, vérification d'email, OTP/2FA) et
 * `UsersModule` (le compte lui-même). Les anciens `EmailVerificationModule` et
 * `OtpModule` ont été absorbés par le premier : ils changeaient pour la même
 * raison et partageaient le même vocabulaire (CCP, §5).
 *
 * Deux points d'histoire, à ne pas défaire :
 * - `SMS_SERVICE` était lié ici (TwilioSmsService inconditionnel, pour l'OTP
 *   SMS de connexion). V2-T2 l'a déplacé dans le `SmsModule` global (importé
 *   une seule fois par AppModule) : le relier ici masquerait ce provider
 *   global pour l'enrôlement SMS et ferait revenir le crash au démarrage quand
 *   les identifiants Twilio sont absents.
 * - Le `forwardRef` mutuel IamModule <-> OtpModule n'avait plus de raison
 *   d'être une fois ce binding parti ; il a été supprimé.
 */
@Module({
  imports: [
    IamInfrastructureModule,
    AuthenticationModule,
    UsersModule,
    ConfigModule,
  ],
  // Traduit les erreurs de domaine IAM en réponses HTTP. Enregistré via
  // APP_FILTER donc actif sur toute l'application : un use case IAM appelé
  // depuis AdminModule ou PaymentsModule doit produire la même réponse.
  // `@Catch(IamError)` limite sa portée au vocabulaire du domaine.
  providers: [{ provide: APP_FILTER, useClass: IamErrorFilter }],
  exports: [IamInfrastructureModule],
})
export class IamModule {}
