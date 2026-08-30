import { ProfilInvestisseur } from 'src/onboarding/domain/value-objects/profil-investisseur.vo';

export const PROFIL_INVESTISSEUR_ACTIF_REPOSITORY = Symbol(
  'PROFIL_INVESTISSEUR_ACTIF_REPOSITORY',
);

/**
 * Au nom de qui un compte agit en ce moment.
 *
 * Deux opérations, et pas de `save` générique (§10) : on **lit** le profil
 * actif, ou on **bascule** vers un autre. Le vocabulaire est celui du métier,
 * pas celui de la table.
 */
export interface ProfilInvestisseurActifRepository {
  /**
   * Le profil actif d'un compte — **jamais `null`**.
   *
   * Un compte qui n'a jamais basculé agit en son nom propre : c'est le repli, et
   * le seul acceptable. Rendre `null` obligerait chaque appelant à retrouver ce
   * défaut, et l'un d'eux finirait par choisir une société à la place du
   * titulaire.
   */
  lire(userId: number): Promise<ProfilInvestisseur>;

  /**
   * Bascule vers un autre profil.
   *
   * L'appartenance de la société au compte est vérifiée **avant** par le use
   * case : ce port ne fait qu'enregistrer un choix déjà éprouvé.
   */
  basculer(userId: number, profil: ProfilInvestisseur): Promise<void>;
}
