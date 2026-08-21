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
   * L'éligibilité du titulaire. Jamais `null` : un compte sans dossier ni
   * questionnaire a une éligibilité — négative — et c'est un état normal du
   * parcours, pas une absence.
   */
  findByInvestorId(investorId: number): Promise<InvestorComplianceProfile>;

  /**
   * Enregistre les pièces que la racine porte. Une pièce restée `null` n'est
   * pas écrite : la racine ne supprime rien, elle dépose.
   */
  save(profile: InvestorComplianceProfile): Promise<InvestorComplianceProfile>;
}
