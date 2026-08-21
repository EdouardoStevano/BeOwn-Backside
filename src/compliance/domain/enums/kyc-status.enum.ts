/**
 * Où en est la vérification d'identité d'un compte.
 *
 * L'enum vivait dans `profiles/domains/enums/kyc-status.enum.ts`, aux côtés de
 * `CategoriePsfp` — le classement PSFP de l'investisseur, qui ne partage avec
 * le KYC ni son cycle de vie ni sa raison de changer. Les deux sont désormais
 * séparés : le statut du dossier appartient à ce contexte, la catégorie PSFP
 * reste dans Profiles (§5 — CCP).
 */
export enum KycStatus {
  NON_DEMARRE = 'non_demarre',
  EN_COURS = 'en_cours',
  EN_REVUE = 'en_revue',
  VALIDE = 'valide',
  REFUSE = 'refuse',
  EXPIRE = 'expire',
  RENOUVELLEMENT = 'renouvellement',
}

/** Diligence exigée par le règlement LCB-FT pour ce dossier. */
export enum KycNiveau {
  SIMPLE = 'simple',
  STANDARD = 'standard',
  RENFORCE = 'renforce',
}
