import { Investment } from 'src/investments/domains/investment';
import { Echeance } from 'src/investments/domains/echeance';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

export const INVESTMENT_REPOSITORY = Symbol('INVESTMENT_REPOSITORY');

export interface InvestmentRepository {
  saveInvestment(investment: Investment): Promise<Investment>;
  findInvestmentById(id: string): Promise<Investment | null>;
  findByUserId(userId: number): Promise<Investment[]>;
  findByProjetId(projetId: string): Promise<Investment[]>;
  updateInvestmentStatus(
    id: string,
    status: InvestmentStatus,
  ): Promise<Investment>;

  saveEcheances(echeances: Echeance[]): Promise<Echeance[]>;
  findEcheancesByInvestissement(investissementId: string): Promise<Echeance[]>;
}
