import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PREFERENCES_REPOSITORY } from '../domains/ports/preferences.repository';
import { UserPreferencesEntity } from './persistences/entities/user-preferences.entity';
import { PreferencesTypeOrmRepository } from './persistences/repositories/preferences.repository';

/**
 * Adapter de sortie du contexte Preferences (§4 — DIP).
 *
 * Module d'infrastructure séparé du module applicatif, comme
 * `ProfilesInfrastructureModule` : les contextes qui lisent ou écrivent une
 * préférence sans exposer de route — le service de désinscription des
 * notifications, `GET /users/me` — importent celui-ci seul, sans tirer le
 * contrôleur ni les use cases (CRP, §5).
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserPreferencesEntity])],
  providers: [
    { provide: PREFERENCES_REPOSITORY, useClass: PreferencesTypeOrmRepository },
  ],
  exports: [PREFERENCES_REPOSITORY],
})
export class PreferencesInfrastructureModule {}
