export enum WalletType {
  INVESTISSEUR = 'investisseur',
  TECHNIQUE_PROJET = 'technique_projet',
  SPV = 'spv',
  FRAIS_PLATEFORME = 'frais_plateforme',
  TAXES = 'taxes',
  SEQUESTRE_IR = 'sequestre_ir',   // Wallet séquestre pour Impôt sur le Revenu (12.8%)
  SEQUESTRE_CSG = 'sequestre_csg', // Wallet séquestre pour CSG/CRDS (17.2%)
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

/**
 * Prestataire à l'origine d'un mouvement, persisté en clair dans
 * `transaction.fournisseur` (colonne `varchar`, sans contrainte d'énumération
 * en base).
 *
 * `CINETPAY` et `FEDAPAY` sont deux agrégateurs de mobile money ouest-africain.
 * Ils n'ont JAMAIS eu d'adaptateur : aucun code n'a jamais produit ni consulté
 * une transaction portant ces valeurs, et le mobile money n'a aucune pertinence
 * sur le marché retenu. Ils sont conservés ici, et nulle part ailleurs, pour
 * une seule raison : ce sont des VALEURS PERSISTABLES. Toute ligne historique
 * qui les porterait — base de démonstration, export, sauvegarde — doit
 * continuer à se relire sans que le mapper ne lève. Les retirer transformerait
 * une donnée d'historique en valeur inconnue.
 *
 * Ils ne doivent donc être proposés nulle part : ni écrits par un use case, ni
 * exposés dans un libellé de moyen de paiement, ni offerts comme filtre à
 * l'utilisateur. Un nouveau flux se rattache à `STRIPE`, `MANUEL` ou `INTERNE`.
 */
export enum TransactionFournisseur {
  STRIPE = 'stripe',
  /** Historique seulement — jamais écrit par le produit. Voir le commentaire ci-dessus. */
  CINETPAY = 'cinetpay',
  /** Historique seulement — jamais écrit par le produit. Voir le commentaire ci-dessus. */
  FEDAPAY = 'fedapay',
  MANUEL = 'manuel',
  INTERNE = 'interne',
}
