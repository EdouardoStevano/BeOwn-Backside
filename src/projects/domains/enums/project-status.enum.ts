export enum ProjectStatus {
  BROUILLON = 'brouillon',
  ANNONCE = 'annonce',
  PRE_INVESTISSEMENT = 'pre_investissement',
  EN_COLLECTE = 'en_collecte',
  FINANCE = 'finance',
  EN_EXPLOITATION = 'en_exploitation',
  CLOTURE = 'cloture',
  ECHEC = 'echec',
  ANNULE = 'annule',
}

/**
 * Statuts pour lesquels les AVIS d'un projet sont consultables sans
 * authentification.
 *
 * Deux routes publiques servent la même donnée — `GET /projects/:id/avis` et
 * `GET /avis/projet/:projetId` — et une seule filtrait : la seconde servait
 * les avis de n'importe quel projet désigné par son UUID, brouillon ou
 * archivé compris, ce qui en faisait un oracle d'existence. La liste est
 * désormais partagée, pour qu'une porte ne puisse plus diverger de l'autre.
 *
 * Volontairement plus étroite que `STATUTS_PROJETS_PUBLICS` (sitemap, qui
 * inclut ANNONCE) : ce périmètre-ci reproduit à l'identique celui qui existait
 * déjà côté `project.controller`, et l'élargir serait une décision produit.
 */
export const STATUTS_PROJET_AVIS_PUBLICS: readonly ProjectStatus[] = [
  ProjectStatus.EN_COLLECTE,
  ProjectStatus.PRE_INVESTISSEMENT,
  ProjectStatus.FINANCE,
];

/**
 * Statuts pour lesquels le portefeuille d'un projet est VERSABLE au porteur.
 *
 * Le versement n'était gardé que par le solde du portefeuille de projet. Or ce
 * portefeuille se remplit DÈS la collecte : un projet encore `en_collecte`,
 * voire en `echec` ou `annule` dont les fonds attendent d'être remboursés aux
 * investisseurs, pouvait être vidé vers le porteur. L'argent des souscripteurs
 * ne devient celui du porteur qu'une fois la collecte ABOUTIE — avant, il leur
 * est encore dû.
 *
 * `cloture` reste versable : un projet clos peut devoir un solde résiduel.
 */
export const STATUTS_PROJET_VERSABLES: readonly ProjectStatus[] = [
  ProjectStatus.FINANCE,
  ProjectStatus.EN_EXPLOITATION,
  ProjectStatus.CLOTURE,
];

export enum ProjectType {
  RESIDENTIEL = 'residentiel',
  TERTIAIRE = 'tertiaire',
  MARCHAND_DE_BIENS = 'marchand_de_biens',
  VIAGER = 'viager',
  TOKENISE = 'tokenise',
  AUTRE = 'autre',
}

export enum ProjectInstrument {
  OBLIGATION = 'obligation',
  OBLIGATION_AMORTISSABLE = 'obligation_amortissable',
  ACTION = 'action',
  PART_SOCIALE = 'part_sociale',
}

export enum DocumentProjetType {
  DICI = 'dici',
  KID = 'kid',
  BUSINESS_PLAN = 'business_plan',
  CONTRAT_OBLIGATION = 'contrat_obligation',
  STATUTS_SPV = 'statuts_spv',
  RAPPORT = 'rapport',
  AUTRE = 'autre',
}
