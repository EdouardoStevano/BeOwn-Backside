export enum WalletType {
  INVESTISSEUR = 'investisseur',
  TECHNIQUE_PROJET = 'technique_projet',
  SPV = 'spv',
  FRAIS_PLATEFORME = 'frais_plateforme',
  TAXES = 'taxes',
}

export enum TransactionType {
  DEPOT = 'depot',
  RETRAIT = 'retrait',
  SOUSCRIPTION = 'souscription',
  REMBOURSEMENT_CAPITAL = 'remboursement_capital',
  PAIEMENT_INTERETS = 'paiement_interets',
  FRAIS = 'frais',
  IMPOTS = 'impots',
  ESCROW_LOCK = 'escrow_lock',
  ESCROW_RELEASE = 'escrow_release',
  INTERNE = 'interne',
  REMBOURSEMENT_COLLECTE_ECHEC = 'remboursement_collecte_echec',
}

export enum TransactionStatus {
  INITIE = 'initie',
  EN_ATTENTE_PAIEMENT = 'en_attente_paiement',
  EN_COURS = 'en_cours',
  REUSSI = 'reussi',
  ECHOUE = 'echoue',
  ANNULE = 'annule',
  REMBOURSE = 'rembourse',
  EXPIRE = 'expire',
}

export enum TransactionFournisseur {
  STRIPE = 'stripe',
  CINETPAY = 'cinetpay',
  FEDAPAY = 'fedapay',
  MANUEL = 'manuel',
  INTERNE = 'interne',
}
