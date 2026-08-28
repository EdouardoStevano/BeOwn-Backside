import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';

export const INVESTOR_COMPLIANCE_PROFILE_REPOSITORY = Symbol(
  'INVESTOR_COMPLIANCE_PROFILE_REPOSITORY',
);

/**
 * Accès à l'éligibilité réglementaire d'un investisseur, chargée d'un bloc.
 *
 * La racine se compose de deux tables — `kyc` et `questionnaire_adequation` —
 * et c'est l'adapter qui les réunit : le découpage du stockage ne suit pas
 * celui du domaine, et c'est exactement le rôle d'un repository (§10, §16).
 *
 * Deux méthodes, pas plus. Les lectures qui n'ont besoin que d'une pièce — la
 * liste d'administration des dossiers, l'avancement du parcours d'entrée en
 * relation — passent par les ports de ces pièces : reconstruire une racine
 * complète pour afficher un statut serait payer une jointure pour rien (§11 :
 * une Query n'a pas besoin de l'agrégat).
 */
export interface InvestorComplianceProfileRepository {
  /**
   * L'éligibilité du **titulaire lui-même**. Jamais `null` : un compte sans
   * dossier ni questionnaire a une éligibilité — négative — et c'est un état
   * normal du parcours, pas une absence.
   *
   * C'est le dossier qui porte le KYC, et le seul : une société n'a pas
   * d'identité à vérifier. Pour le classement d'une société, voir
   * {@link parSociete}.
   */
  findByInvestorId(investorId: number): Promise<InvestorComplianceProfile>;

  /**
   * Le dossier d'une des sociétés du titulaire — son questionnaire et le
   * classement PSFP qui en découle.
   *
   * Il existe parce que **le classement s'apprécie sur l'investisseur, pas sur
   * le compte** : une SAS peut être professionnelle quand son dirigeant est
   * non-averti, et lui opposer le plafond de son représentant lui imposerait un
   * délai de rétractation qui ne la concerne pas.
   *
   * Il ne porte **jamais de KYC**. L'identité vérifiée est celle du
   * représentant, sur le dossier du titulaire, et elle vaut pour toutes ses
   * sociétés — c'est précisément l'économie que le cahier des charges vise.
   *
   * @param investorId le compte qui déclare la société : il porte la clé
   *   étrangère, et le suivi périodique reste rattaché à une personne joignable.
   */
  parSociete(
    investorId: number,
    societeId: string,
  ): Promise<InvestorComplianceProfile>;

  /**
   * Enregistre les pièces que la racine porte. Une pièce restée `null` n'est
   * pas écrite : la racine ne supprime rien, elle dépose.
   */
  save(profile: InvestorComplianceProfile): Promise<InvestorComplianceProfile>;
}
