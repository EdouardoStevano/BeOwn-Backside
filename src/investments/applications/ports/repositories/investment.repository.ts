import { Investment } from 'src/investments/domains/investment';
import { Echeance } from 'src/investments/domains/echeance';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

export const INVESTMENT_REPOSITORY = Symbol('INVESTMENT_REPOSITORY');

export interface InvestmentRepository {
  saveInvestment(investment: Investment): Promise<Investment>;
  findInvestmentById(id: string): Promise<Investment | null>;
  findByUserId(userId: number): Promise<Investment[]>;
  findByProjetId(projetId: string): Promise<Investment[]>;
  countFractionsVendues(projetId: string): Promise<number>;
  countFractionsVenduesBatch(projetIds: string[]): Promise<Record<string, number>>;
  updateInvestmentStatus(
    id: string,
    status: InvestmentStatus,
  ): Promise<Investment>;

  updateBulletinDocId(investmentId: string, bulletinDocId: string): Promise<void>;
  updateTopUp(id: string, nbTitresTotal: number, montantTotal: number): Promise<Investment>;

  saveEcheances(echeances: Echeance[]): Promise<Echeance[]>;
  deleteEcheancesByInvestissementId(investissementId: string): Promise<void>;
  findEcheancesByInvestissement(investissementId: string): Promise<Echeance[]>;
}
