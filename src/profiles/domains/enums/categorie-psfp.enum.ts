/**
 * Documents recevables à l'appui d'un dossier réglementaire.
 *
 * Le fichier s'appelait `kyc-status.enum.ts` et portait aussi `KycStatus` et
 * `KycNiveau`. Ceux-là sont partis avec le contexte KYC ; ce qui reste ici
 * relève du classement PSFP de l'investisseur, qui n'a ni le même cycle de vie
 * ni la même raison de changer (§5 — CCP).
 */
export enum DocumentKycType {
  CNI = 'cni',
  PASSEPORT = 'passeport',
  PERMIS = 'permis',
  JUSTIFICATIF_DOMICILE = 'justificatif_domicile',
  RIB = 'rib',
  KBIS = 'kbis',
  STATUTS = 'statuts',
  DBE_S1 = 'dbe_s1',
  AUTRE = 'autre',
}

/**
 * Catégorie d'investisseur au sens du règlement PSFP, déduite du questionnaire
 * d'adéquation (`ResultatAdequation.calculer`).
 */
export enum CategoriePsfp {
  NON_AVERTI = 'non_averti',
  AVERTI = 'averti',
  PROFESSIONNEL = 'professionnel',
}
