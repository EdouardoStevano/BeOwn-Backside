import { KycCaseSnapshot } from 'src/compliance/domain/entities/kyc-case';

export const DOSSIER_KYC_QUERY = Symbol('DOSSIER_KYC_QUERY');

/**
 * Ce que les écrans lisent d'un dossier de vérification, sans passer par la
 * racine.
 *
 * **Un port de lecture, pas un repository** (§11). La différence n'est pas de
 * vocabulaire : un repository rend un agrégat, c'est-à-dire quelque chose qui
 * se modifie et se réenregistre. Ici rien ne se modifie — on affiche un statut,
 * on pagine une liste d'administration, on compose un écran de compte. Passer
 * par `InvestorComplianceProfileRepository` pour cela reconstruirait la racine
 * et ses deux pièces pour en lire trois champs.
 *
 * Il rend des **instantanés** — des primitives à plat, exactement le JSON que
 * les routes publiaient déjà. Aucune entité ne sort : c'est ce qui permet de
 * supprimer `KycRepository`, dont `KycCase` — une entité interne à la racine —
 * n'aurait jamais dû avoir l'équivalent (§6, §10).
 */
export interface DossierKycQuery {
  /** Le dossier d'un titulaire, `null` s'il n'en a pas encore ouvert. */
  parTitulaire(utilisateurId: number): Promise<KycCaseSnapshot | null>;

  /** Page de la liste d'administration, du plus récent au plus ancien. */
  lister(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ items: KycCaseSnapshot[]; total: number }>;
}
