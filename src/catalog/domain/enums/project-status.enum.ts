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
