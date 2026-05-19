import type { ProjectInstrument, ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

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

export interface InvestorProjectKpi {
  projetId: string;
  projetTitre: string;
  statut: ProjectStatus;
  capitalInvesti: number;
  capitalRestantDu: number;
  interetsBrutsRecus: number;
  interetsNetsRecus: number;
  triCible: number;
  triRealise: number | null;
  walMois: number | null;
  prochaineEcheanceDate: Date | null;
  nbEcheancesEnRetard: number;
  aEnDefaut: boolean;
}

export interface InvestorProchaineEcheance {
  date: Date;
  montantBrut: number;
  montantNet: number;
  projetId: string;
  projetTitre: string;
}

export interface InvestorPortfolioKpis {
  capitalInvestiTotal: number;
  capitalRestantDu: number;
  interetsBrutsCumules: number;
  interetsNetsCumules: number;
  prelevementsFiscauxCumules: number;
  triRealise: number | null;
  triPondereCible: number;
  walMois: number | null;
  prochaineEcheance: InvestorProchaineEcheance | null;
  parProjet: InvestorProjectKpi[];
  regimeFiscal: RegimeFiscal;
  truncated?: boolean;
}

export interface ProjectEcheanceLine {
  numero: number;
  datePrevue: Date;
  montantCapital: number;
  montantInterets: number;
  montantTotal: number;
  statut: 'a_venir' | 'payee' | 'retard' | 'defaut';
}

export interface ProjectPublicKpis {
  triCible: number;
  dureeMois: number;
  capitalCible: number;
  instrument: ProjectInstrument;
  capitalCollecte: number;
  pctCollecte: number;
  nbInvestisseurs: number;
  capitalRestantDuGlobal: number;
  capitalRembourse: number;
  pctCapitalRembourse: number;
  interetsVersesTotaux: number;
  walMois: number | null;
  echeancesEnRetard: number;
  echeancesEnDefaut: number;
  statutSante: 'sain' | 'retard_leger' | 'retard_significatif' | 'defaut' | 'perte';
  echeancierPrevisionnel: ProjectEcheanceLine[];
}
