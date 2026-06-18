import { Charge } from '../../../domains/charge';
import { StatutDeclaration } from '../../../domains/enums/statut-declaration.enum';

export const CHARGE_REPOSITORY = Symbol('CHARGE_REPOSITORY');

export interface ChargeRepository {
  save(c: Charge): Promise<Charge>;
  findById(id: string): Promise<Charge | null>;
  findByProjetEtPeriode(projetId: string, periode: string): Promise<Charge[]>;
  findByStatut(statut: StatutDeclaration): Promise<Charge[]>;
  findValidesParProjetEtPeriode(
    projetId: string,
    periode: string,
  ): Promise<Charge[]>;
}
