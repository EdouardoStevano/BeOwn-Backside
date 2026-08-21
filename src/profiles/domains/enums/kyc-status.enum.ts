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

/**
 * Le règlement (UE) 2020/1503 ne connaît que deux catégories d'investisseur.
 * La catégorie « professionnel » qui existait ici n'a pas de fondement dans le
 * règlement : un investisseur professionnel au sens de MiFID est simplement
 * réputé averti. Voir `src/profiles/domains/investor-classification.ts`.
 */
export { CategorieInvestisseur } from '../investor-classification';
