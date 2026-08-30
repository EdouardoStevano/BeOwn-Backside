import { ProfilPM } from 'src/onboarding/domain/aggregates/profil-pm';

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

  /** Un dossier précis, désigné par sa propre identité. */
  findById(id: string): Promise<ProfilPM | null>;

  /**
   * Toutes les sociétés déclarées par un compte, des plus anciennes aux plus
   * récentes.
   *
   * Rend une liste et non un dossier : la méthode s'appelait `findByUserId` et
   * rendait `ProfilPM | null` du temps où un compte n'en portait qu'un. Garder
   * cette forme aurait fait choisir arbitrairement une société parmi
   * plusieurs — et le choix se serait fait dans le `LIMIT 1` implicite d'un
   * `findOne`, là où personne ne l'aurait cherché.
   */
  listerParUtilisateur(userId: number): Promise<ProfilPM[]>;

  update(profil: ProfilPM): Promise<ProfilPM>;
}
