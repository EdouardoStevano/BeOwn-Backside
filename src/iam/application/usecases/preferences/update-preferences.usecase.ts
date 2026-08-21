import { Inject, Injectable } from '@nestjs/common';
import {
  PREFERENCES_REPOSITORY,
  type PreferencesRepository,
} from 'src/iam/domain/repositories/preferences.repository';
import {
  ChampsPreferences,
  Preferences,
} from 'src/iam/domain/entities/preferences';

/**
 * Mise à jour des réglages du titulaire.
 *
 * Un seul use case pour les six routes qui existaient : régler la langue et
 * basculer les notifications SMS sont la même opération, sur des champs
 * différents. Les cinq routes unitaires du contrôleur de compte appelaient
 * déjà toutes `savePreferences` avec un objet d'un champ — la duplication
 * était de présentation, pas de métier.
 */
@Injectable()
export class UpdatePreferencesUseCase {
  constructor(
    @Inject(PREFERENCES_REPOSITORY)
    private readonly preferencesRepository: PreferencesRepository,
  ) {}

  async execute(
    userId: number,
    champs: ChampsPreferences,
  ): Promise<Preferences> {
    const preferences = await this.preferencesRepository.findByUserId(userId);

    // Rien n'a bougé : on rend l'état sans écrire. Le titulaire qui rebascule
    // deux fois le même interrupteur ne produit pas deux lignes d'historique.
    if (!preferences.modifier(champs)) return preferences;

    return this.preferencesRepository.save(preferences);
  }
}
