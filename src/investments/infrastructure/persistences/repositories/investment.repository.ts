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
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';

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

  private withProjet() {
    return this.investRepo
      .createQueryBuilder('inv')
      .leftJoinAndMapOne(
        'inv.projet',
        ProjectEntity,
        'p',
        'p.id = inv."projetId"',
      );
  }

  async findInvestmentById(id: string): Promise<Investment | null> {
    const entity = await this.withProjet()
      .where('inv.id = :id', { id })
      .getOne();
    return entity ? InvestmentMapper.toDomain(entity) : null;
  }

  async findByUserId(userId: number): Promise<Investment[]> {
    const entities = await this.withProjet()
      .where('inv.utilisateurId = :userId', { userId })
      .orderBy('inv.createdAt', 'DESC')
      .getMany();
    return entities.map(InvestmentMapper.toDomain);
  }

  async findByProjetId(projetId: string): Promise<Investment[]> {
    const entities = await this.withProjet()
      .where('inv.projetId = :projetId', { projetId })
      .orderBy('inv.createdAt', 'ASC')
      .getMany();
    return entities.map(InvestmentMapper.toDomain);
  }

  async countFractionsVendues(projetId: string): Promise<number> {
    const result = await this.investRepo
      .createQueryBuilder('i')
      .select('COALESCE(SUM(i.nbTitres), 0)', 'total')
      .where('i.projetId = :projetId', { projetId })
      .andWhere('i.statut NOT IN (:...exclus)', {
        exclus: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE],
      })
      .getRawOne();
    return Number(result?.total ?? 0);
  }

  async countFractionsVenduesBatch(
    projetIds: string[],
  ): Promise<Record<string, number>> {
    if (projetIds.length === 0) return {};
    const rows = await this.investRepo
      .createQueryBuilder('i')
      .select('i.projetId', 'projetId')
      .addSelect('COALESCE(SUM(i.nbTitres), 0)', 'total')
      .where('i.projetId IN (:...projetIds)', { projetIds })
      .andWhere('i.statut NOT IN (:...exclus)', {
        exclus: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE],
      })
      .groupBy('i.projetId')
      .getRawMany<{ projetId: string; total: string }>();
    return Object.fromEntries(rows.map((r) => [r.projetId, Number(r.total)]));
  }

  async updateInvestmentStatus(
    id: string,
    status: InvestmentStatus,
  ): Promise<Investment> {
    await this.investRepo.update(id, { statut: status });
    const updated = await this.investRepo.findOneOrFail({ where: { id } });
    return InvestmentMapper.toDomain(updated);
  }

  async updateBulletinDocId(investmentId: string, bulletinDocId: string): Promise<void> {
    await this.investRepo.update(investmentId, { bulletinDocId });
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
}
