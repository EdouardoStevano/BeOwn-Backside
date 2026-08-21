import { ProfilPM } from 'src/compliance/domain/aggregates/profil-pm';

export const PROFIL_PM_REPOSITORY = Symbol('PROFIL_PM_REPOSITORY');

/**
 * Accès en persistance au profil personne morale.
 *
 * Voir `ProfilPPRepository` pour le pourquoi du découpage par agrégat, et pour
 * la raison d'être de `update` à côté de `save` : l'implémentation est la même
 * — `utilisateurId` est la clé primaire — mais l'intention de l'appelant
 * diffère, et c'est le use case qui la porte.
 */
export interface ProfilPMRepository {
  save(profil: ProfilPM): Promise<ProfilPM>;
  findByUserId(userId: number): Promise<ProfilPM | null>;
  update(profil: ProfilPM): Promise<ProfilPM>;
}
