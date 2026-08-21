import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { PreferencesInfrastructureModule } from 'src/iam/infrastructure/preferences-infrastructure.module';
import { PreferencesController } from 'src/iam/presentation/http/preferences.controller';
import { GetPreferencesUseCase } from './usecases/preferences/get-preferences.usecase';
import { UpdatePreferencesUseCase } from './usecases/preferences/update-preferences.usecase';

/**
 * Réglages du titulaire : langue, affichage, canaux de notification.
 *
 * Une **feature d'IAM**, au même rang qu'`AuthenticationModule` et
 * `UsersModule`. Ce module a d'abord été un Bounded Context séparé, au motif
 * que ce qu'on règle ici ne prouve aucune identité et ne conditionne aucun
 * accès — un argument qui distingue deux *sujets*, pas deux *langages*. Or les
 * réglages n'ont de sens que rapportés à un titulaire, ils ne se lisent ni ne
 * s'écrivent sans lui, et leur seul invariant non trivial parle de MFA : le
 * vocabulaire est celui d'`identity` (§3.2).
 *
 * Ce qui a motivé sa création reste vrai et reste acquis : les sept routes ne
 * sont pas revenues dans `UserController`, qui portait quatre sujets à lui seul.
 * Un module par sujet à l'intérieur du contexte — c'est CCP (§24), pas une
 * frontière de contexte.
 *
 * Il garde son propre module Nest plutôt que d'être fondu dans `UsersModule` :
 * Notifications lit les préférences pour décider d'un canal, et `UsersModule`
 * importe déjà Notifications. Les fondre fermerait le cycle.
 */
@Module({
  imports: [
    PreferencesInfrastructureModule,
    // Fournit `TokenService` au `JwtAuthGuard` monté par le contrôleur.
    IamInfrastructureModule,
  ],
  // Plus de filtre propre : les erreurs de préférence sont des `IamError`
  // depuis qu'elles ont rejoint le contexte, et `IamErrorFilter` — enregistré
  // globalement par `IamModule` — les traduit avec les mêmes statuts et le même
  // corps que `PreferencesErrorFilter` produisait.
  providers: [GetPreferencesUseCase, UpdatePreferencesUseCase],
  controllers: [PreferencesController],
  exports: [
    // Consommés hors du contexte : `GET /users/me` compose les réglages avec
    // le compte, et la désinscription marketing en règle un.
    GetPreferencesUseCase,
    UpdatePreferencesUseCase,
    PreferencesInfrastructureModule,
  ],
})
export class PreferencesModule {}
