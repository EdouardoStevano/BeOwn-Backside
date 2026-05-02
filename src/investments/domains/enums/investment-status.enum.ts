export enum InvestmentStatus {
  INITIE = 'initie',
  ADEQUATION_OK = 'adequation_ok',
  PAIEMENT_ATTENDU = 'paiement_attendu',
  PAYE = 'paye',
  SIGNE = 'signe',
  RETRACTE = 'retracte',
  CONFIRME = 'confirme',
  ANNULE = 'annule',
  REMBOURSE_CAPITAL = 'rembourse_capital',
  REMBOURSE_TOTAL = 'rembourse_total',
}

export enum EcheanceStatus {
  A_VENIR = 'a_venir',
  EN_ATTENTE_PAIEMENT = 'en_attente_paiement',
  PAYE = 'paye',
  RETARD = 'retard',
  IMPAYE = 'impaye',
  ANNULE = 'annule',
}

export enum RemboursementMode {
  IN_FINE = 'in_fine',
  AMORTISSABLE_CONSTANT = 'amortissable_constant',
  BULLET_INTERETS_TRIMESTRIELS = 'bullet_interets_trimestriels',
}
