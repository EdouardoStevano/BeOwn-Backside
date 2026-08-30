import { CategoriePsfp } from 'src/adequacy/domain/enums/categorie-psfp.enum';

export const CLASSEMENT_DU_TITULAIRE_QUERY = Symbol(
  'CLASSEMENT_DU_TITULAIRE_QUERY',
);

/**
 * `CategoriePsfp` est le **Published Language** de ce contexte, réexporté ici
 * pour que les contextes en aval l'importent du port et non du domaine.
 *
 * Elle traverse la frontière parce qu'elle est le vocabulaire du règlement UE
 * 2020/1503, pas une convention interne : la dupliquer ferait exister deux
 * énumérations dont les valeurs seraient comparées entre elles, et qu'il
 * faudrait tenir synchronisées à chaque évolution réglementaire. Le
 * réexport rend l'arête explicite — l'aval dépend d'un contrat applicatif,
 * jamais d'un dossier `domain/` voisin (§13).
 */
export { CategoriePsfp };

/** Jusqu'où un souscripteur peut aller, au titre du questionnaire d'adéquation. */
export interface ClassementDuTitulaire {
  categoriePsfp: CategoriePsfp;
  estNonAverti: boolean;
  /** `null` pour qui n'est pas non averti — la recommandation ne le concerne pas. */
  plafondConseille: number | null;
  patrimoineDeclare: number | null;
}

/**
 * Ce que les autres contextes lisent de l'adéquation, sans en tenir l'agrégat.
 *
 * **Le seul client est l'entrée en relation**, qui compose ce classement avec
 * l'aptitude à opérer pour rendre aux contextes financiers une éligibilité d'un
 * seul tenant. C'est l'unique arête entre les deux moitiés de l'ancien contexte
 * de conformité, et elle est à sens unique : l'adéquation ignore l'existence du
 * KYC, du KYB et des pièces justificatives (§3.4 — Customer/Supplier,
 * l'adéquation en amont).
 *
 * Il rend des primitives, jamais l'agrégat (§11) : le contexte en aval retient
 * un verdict, il ne rejoue pas la formule PSFP qui l'a produit.
 */
export interface ClassementDuTitulaireQuery {
  /**
   * Le classement d'un titulaire, en son nom propre.
   *
   * Jamais `null` : qui n'a pas répondu au questionnaire **est** non averti.
   * Le classement se gagne, il ne se présume pas — et rendre `null` obligerait
   * chaque appelant à retrouver ce repli, en oubliant parfois.
   */
  duTitulaire(investorId: number): Promise<ClassementDuTitulaire>;

  /**
   * Le classement **d'une société** du titulaire.
   *
   * Elle a le sien : une SAS peut être professionnelle quand son dirigeant est
   * non-averti. Lui opposer le classement de son représentant reviendrait à la
   * plafonner comme une personne physique.
   */
  deLaSociete(
    investorId: number,
    societeId: string,
  ): Promise<ClassementDuTitulaire>;
}
