import type { DossierDEntreeEnRelation } from '../aggregates/dossier-d-entree-en-relation';

export const DOSSIER_ENTREE_EN_RELATION_REPOSITORY = Symbol(
  'DOSSIER_ENTREE_EN_RELATION_REPOSITORY',
);

/**
 * Accès au dossier d'entrée en relation d'un souscripteur, chargé d'un bloc.
 *
 * La racine se compose de deux tables — sa ligne propre et `kyc` — et c'est
 * l'adapter qui les réunit : le découpage du stockage ne suit pas celui du
 * domaine (§10, §16).
 *
 * Deux lectures et une écriture, pas plus. Ce qui n'a besoin que d'un statut —
 * la liste d'administration, l'avancement du parcours — passe par les ports de
 * lecture : reconstruire une racine pour afficher un statut serait payer une
 * jointure pour rien (§11).
 */
export interface DossierDEntreeEnRelationRepository {
  /**
   * Le dossier du **titulaire lui-même**. Jamais `null` : un compte sans
   * vérification a un dossier — négatif — et c'est un état normal du parcours,
   * pas une absence.
   *
   * C'est lui qui porte le KYC, et le seul : une société n'a pas d'identité à
   * vérifier. Pour son verdict, voir {@link parSociete}.
   */
  parTitulaire(investorId: number): Promise<DossierDEntreeEnRelation>;

  /**
   * Le dossier d'une des sociétés du titulaire — son **KYB**, avec sa date, son
   * auteur et son échéance.
   *
   * Il ne porte jamais de KYC. L'identité vérifiée est celle du représentant,
   * sur le dossier du titulaire, et elle vaut pour toutes ses sociétés — c'est
   * précisément l'économie que le cahier des charges vise.
   *
   * @param investorId le compte qui déclare la société : il porte la clé
   *   étrangère, et le suivi reste rattaché à une personne joignable.
   */
  parSociete(
    investorId: number,
    societeId: string,
  ): Promise<DossierDEntreeEnRelation>;

  /**
   * Enregistre la pièce et le verdict que la racine porte. Une pièce restée
   * `null` n'est pas écrite : la racine ne supprime rien, elle dépose.
   */
  save(dossier: DossierDEntreeEnRelation): Promise<DossierDEntreeEnRelation>;
}
