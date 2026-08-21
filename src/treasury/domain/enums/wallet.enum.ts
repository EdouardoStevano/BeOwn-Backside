/**
 * Les natures de portefeuille de la plateforme.
 *
 * > Le cahier des charges (M7) en annonce cinq ; il y en a sept. `SEQUESTRE_IR`
 * > et `SEQUESTRE_CSG` sont nés du prélèvement forfaitaire unique (RG-ECH-04/05)
 * > pour isoler la retenue à la source en attendant son reversement — un besoin
 * > réel, apparu après la rédaction. L'écart est ici pour être vu, pas corrigé
 * > en douce : c'est la spécification qui a du retard sur le produit.
 */
export enum WalletType {
  INVESTISSEUR = 'investisseur',
  TECHNIQUE_PROJET = 'technique_projet',
  SPV = 'spv',
  FRAIS_PLATEFORME = 'frais_plateforme',
  TAXES = 'taxes',
  SEQUESTRE_IR = 'sequestre_ir', // Wallet séquestre pour Impôt sur le Revenu (12.8%)
  SEQUESTRE_CSG = 'sequestre_csg', // Wallet séquestre pour CSG/CRDS (17.2%)
}

/**
 * L'état d'un portefeuille au regard des mouvements.
 *
 * Remplace le `statut: string` qui ne portait jamais que `'actif'` (§8 : ne pas
 * laisser un `string` là où le métier a un type).
 *
 * > `GELE` n'est posé par aucun chemin aujourd'hui — la route de gel du
 * > back-office n'existe pas. L'invariant est néanmoins gardé par l'agrégat
 * > pour que, le jour où elle existera, aucun mouvement ne puisse la
 * > contourner : `WALLET_FROZEN` figure déjà au tableau des erreurs de §21,
 * > c'est-à-dire au contrat que le front est censé savoir lire.
 */
export enum WalletStatut {
  ACTIF = 'actif',
  GELE = 'gele',
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
