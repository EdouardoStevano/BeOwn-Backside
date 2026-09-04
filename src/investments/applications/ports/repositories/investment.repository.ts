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

  /**
   * Vrai si cet utilisateur détient encore des parts émises par une société
   * support donnée, tous projets confondus.
   *
   * Sert au sens inverse de la décision D5 : on ne devient pas porteur d'un
   * projet dont on détient déjà des parts. Le périmètre est la SOCIÉTÉ SUPPORT
   * et non le projet, parce que c'est elle qui émet les parts — deux projets
   * adossés à la même SCI mettent leur porteur et leurs associés autour de la
   * même table.
   *
   * Les positions RETRACTE et ANNULE sont exclues : elles ne confèrent plus
   * aucun droit, exactement comme dans `countFractionsVendues`.
   */
  existeDetentionSurSocieteSupport(
    utilisateurId: number,
    spvId: string,
  ): Promise<boolean>;
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
