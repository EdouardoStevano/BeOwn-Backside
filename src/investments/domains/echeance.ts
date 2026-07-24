import { EcheanceStatus } from './enums/investment-status.enum';

export class Echeance {
  id: string;
  investissementId: string;
  numero: number;
  datePrevue: Date;
  montantCapital: number;
  montantInterets: number;
  montantTotal: number;
  prelevementIR: number = 0;
  prelevementCSG: number = 0;
  statut: EcheanceStatus;
  payeLe: Date | null;
  rappelJ7Envoye: boolean = false;
  rappelJ1Envoye: boolean = false;
}
