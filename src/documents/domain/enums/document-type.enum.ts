export enum DocumentType {
  IDENTITE = 'IDENTITE',
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
  // `PHOTO_PROJET` a quitté cette énumération : une photo de fiche est du
  // contenu éditorial, pas une pièce qui se signe. Elle est devenue
  // `PhotoProjet`, entité de l'agrégat `Project` du contexte Catalog (§3.2).
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
