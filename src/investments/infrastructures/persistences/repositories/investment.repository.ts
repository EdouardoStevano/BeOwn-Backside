import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvestmentRepository } from 'src/investments/applications/ports/repositories/investment.repository';
import { Investment } from 'src/investments/domains/investment';
import { Echeance } from 'src/investments/domains/echeance';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { InvestmentEntity } from '../entities/investment.entity';
import { EcheanceEntity } from '../entities/echeance.entity';
import { InvestmentMapper } from '../mappers/investment.mapper';

const EXCLUDED_STATUTS = [InvestmentStatus.ANNULE, InvestmentStatus.RETRACTE];

@Injectable()
export class InvestmentTypeOrmRepository implements InvestmentRepository {
  constructor(
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
  ) {}

  async saveInvestment(investment: Investment): Promise<Investment> {
    const entity = InvestmentMapper.toEntity(investment);
    const saved = await this.investRepo.save(entity);
    return InvestmentMapper.toDomain(saved);
  }

  async findInvestmentById(id: string): Promise<Investment | null> {
    const entity = await this.investRepo.findOne({ where: { id } });
    return entity ? InvestmentMapper.toDomain(entity) : null;
  }

  async findByUserId(userId: number): Promise<Investment[]> {
    const entities = await this.investRepo.find({
      where: { utilisateurId: userId },
      order: { createdAt: 'DESC' },
    });
    return entities.map(InvestmentMapper.toDomain);
  }

  async findByProjetId(projetId: string): Promise<Investment[]> {
    const entities = await this.investRepo.find({
      where: { projetId },
      order: { createdAt: 'ASC' },
    });
    return entities.map(InvestmentMapper.toDomain);
  }

  async updateInvestmentStatus(
    id: string,
    status: InvestmentStatus,
  ): Promise<Investment> {
    await this.investRepo.update(id, { statut: status });
    const updated = await this.investRepo.findOneOrFail({ where: { id } });
    return InvestmentMapper.toDomain(updated);
  }

  async saveEcheances(echeances: Echeance[]): Promise<Echeance[]> {
    const entities = echeances.map(InvestmentMapper.echeanceToEntity);
    const saved = await this.echeanceRepo.save(entities);
    return saved.map(InvestmentMapper.echeanceToDomain);
  }

  async findEcheancesByInvestissement(
    investissementId: string,
  ): Promise<Echeance[]> {
    const entities = await this.echeanceRepo.find({
      where: { investissementId },
      order: { numero: 'ASC' },
    });
    return entities.map(InvestmentMapper.echeanceToDomain);
  }

  async countFractionsVendues(projetId: string): Promise<number> {
    const result = await this.investRepo
      .createQueryBuilder('inv')
      .select('COALESCE(SUM(inv.nbTitres), 0)', 'total')
      .where('inv.projetId = :projetId', { projetId })
      .andWhere('inv.statut NOT IN (:...excluded)', { excluded: EXCLUDED_STATUTS })
      .getRawOne<{ total: string }>();
    return parseInt(result?.total ?? '0', 10);
  }

  async countFractionsVenduesBatch(
    projetIds: string[],
  ): Promise<Record<string, number>> {
    if (projetIds.length === 0) return {};
    const rows = await this.investRepo
      .createQueryBuilder('inv')
      .select('inv.projetId', 'projetId')
      .addSelect('COALESCE(SUM(inv.nbTitres), 0)', 'total')
      .where('inv.projetId IN (:...projetIds)', { projetIds })
      .andWhere('inv.statut NOT IN (:...excluded)', { excluded: EXCLUDED_STATUTS })
      .groupBy('inv.projetId')
      .getRawMany<{ projetId: string; total: string }>();
    return Object.fromEntries(rows.map((r) => [r.projetId, parseInt(r.total, 10)]));
  }

  async updateBulletinDocId(
    investmentId: string,
    bulletinDocId: string,
  ): Promise<void> {
    await this.investRepo.update(investmentId, { bulletinDocId });
  }

  async updateTopUp(
    id: string,
    nbTitresTotal: number,
    montantTotal: number,
  ): Promise<Investment> {
    await this.investRepo.update(id, { nbTitres: nbTitresTotal, montant: montantTotal });
    const updated = await this.investRepo.findOneOrFail({ where: { id } });
    return InvestmentMapper.toDomain(updated);
  }

  async deleteEcheancesByInvestissementId(
    investissementId: string,
  ): Promise<void> {
    await this.echeanceRepo.delete({ investissementId });
  }
}
