import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { PreferencesInfrastructureModule } from 'src/preferences/infrastructure/preferences-infrastructure.module';
import { PreferencesErrorFilter } from 'src/preferences/presenters/http/filters/preferences-error.filter';
import { PreferencesController } from 'src/preferences/presenters/http/preferences.controller';
import { GetPreferencesUseCase } from './usecases/get-preferences.usecase';
import { UpdatePreferencesUseCase } from './usecases/update-preferences.usecase';

/**
 * Réglages du titulaire : langue, affichage, canaux de notification.
 *
 * Un contexte à part, et non un dossier de plus dans IAM : ce qu'on règle ici
 * ne prouve aucune identité et ne conditionne aucun accès. Les sept routes
 * vivaient dans `UserController`, qui portait de ce fait quatre sujets
 * (compte, dossier investisseur, préférences, administration) — un module qui
 * change pour quatre raisons (§5 — CCP).
 */
@Module({
  imports: [
    PreferencesInfrastructureModule,
    // Fournit `TokenService` au `JwtAuthGuard` monté par le contrôleur.
    IamInfrastructureModule,
  ],
  providers: [
    GetPreferencesUseCase,
    UpdatePreferencesUseCase,
    { provide: APP_FILTER, useClass: PreferencesErrorFilter },
  ],
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
