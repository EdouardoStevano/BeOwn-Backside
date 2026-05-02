export enum KycStatus {
  NON_DEMARRE = 'non_demarre',
  EN_COURS = 'en_cours',
  EN_REVUE = 'en_revue',
  VALIDE = 'valide',
  REFUSE = 'refuse',
  EXPIRE = 'expire',
  RENOUVELLEMENT = 'renouvellement',
}

export enum KycNiveau {
  SIMPLE = 'simple',
  STANDARD = 'standard',
  RENFORCE = 'renforce',
}

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

export enum CategoriePsfp {
  NON_AVERTI = 'non_averti',
  AVERTI = 'averti',
  PROFESSIONNEL = 'professionnel',
}
