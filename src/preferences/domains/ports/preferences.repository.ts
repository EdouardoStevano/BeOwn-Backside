import { Preferences } from 'src/preferences/domains/preferences';

export const PREFERENCES_REPOSITORY = Symbol('PREFERENCES_REPOSITORY');

/**
 * Accès en persistance aux réglages d'un titulaire.
 *
 * Ces deux méthodes vivaient sur `UserRepository` (`findPreferences` /
 * `savePreferences`), ce qui obligeait tout consommateur de préférences — le
 * service de désinscription des notifications, par exemple — à dépendre du
 * port du compte tout entier, ses mots de passe compris (§4 — ISP).
 */
export interface PreferencesRepository {
  /** Jamais `null` : un titulaire sans ligne a les réglages par défaut. */
  findByUserId(userId: number): Promise<Preferences>;
  save(preferences: Preferences): Promise<Preferences>;
}
