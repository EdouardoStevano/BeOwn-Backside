import { LoyerEncaisse } from '../../../domains/loyer-encaisse';
import { StatutDeclaration } from '../../../domains/enums/statut-declaration.enum';

export const LOYER_ENCAISSE_REPOSITORY = Symbol('LOYER_ENCAISSE_REPOSITORY');

export interface LoyerEncaisseRepository {
  save(l: LoyerEncaisse): Promise<LoyerEncaisse>;
  findById(id: string): Promise<LoyerEncaisse | null>;
  findByBailEtPeriode(
    bailId: string,
    periode: string,
  ): Promise<LoyerEncaisse | null>;
  findByStatut(statut: StatutDeclaration): Promise<LoyerEncaisse[]>;
  findValidesParProjetEtPeriode(
    projetId: string,
    periode: string,
  ): Promise<LoyerEncaisse[]>;
}
