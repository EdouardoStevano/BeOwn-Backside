export enum DocumentType {
  IDENTITE = 'IDENTITE',
  /**
   * Photo du visage exigée par la vérification manuelle, en complément de la
   * pièce d'identité (parcours de repli quand Stripe Identity n'aboutit pas).
   * Valeur distincte d'IDENTITE : l'admin doit pouvoir différencier la pièce
   * du selfie lors de la revue.
   */
  SELFIE = 'SELFIE',
  JUSTIFICATIF_DOMICILE = 'JUSTIFICATIF_DOMICILE',
  JUSTIFICATIF_REVENU = 'JUSTIFICATIF_REVENU',
  PROSPECTUS = 'PROSPECTUS',
  RAPPORT_FINANCIER = 'RAPPORT_FINANCIER',
  CONTRAT_SOUSCRIPTION = 'CONTRAT_SOUSCRIPTION',
  CONTRAT_RACHAT = 'CONTRAT_RACHAT',
  BULLETIN_SOUSCRIPTION = 'BULLETIN_SOUSCRIPTION',
  STATUTS_SPV = 'STATUTS_SPV',
  KBIS = 'KBIS',
  PERMIS_CONSTRUIRE = 'PERMIS_CONSTRUIRE',
  PHOTO_PROJET = 'PHOTO_PROJET',
  AUTRE = 'AUTRE',
  FICI = 'FICI',
  DIS = 'DIS',
  IFU_ANNUEL = 'IFU_ANNUEL',
  CONTRAT_RAJOUT = 'CONTRAT_RAJOUT',
  DBE_S1 = 'DBE_S1',
}

export enum DocumentRelatedTo {
  USER = 'USER',
  PROJECT = 'PROJECT',
  INVESTMENT = 'INVESTMENT',
}
