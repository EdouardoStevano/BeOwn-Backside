export interface Cashflow {
  date: Date;
  amount: number;
}

export type RegimeFiscal = 'PFU' | 'BAREME' | 'DISPENSE';

export type EcheanceComputedStatus =
  | 'a_venir'
  | 'payee'
  | 'retard_leger'
  | 'retard_significatif'
  | 'defaut'
  | 'perte_definitive';

export interface ComputedEcheance {
  montantCapital: number;
  montantInterets: number;
  statut: EcheanceComputedStatus;
}

export interface NetCalculationInput {
  interetsBruts: number;
  regime: RegimeFiscal;
  tauxBaremeMarginal?: number;
}

export interface NetCalculationOutput {
  net: number;
  prelevementIR: number;
  prelevementCSG: number;
}
