import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvestmentRepository } from 'src/subscription/domain/repositories/investment.repository';
import { Investment } from 'src/subscription/domain/aggregates/investment';
import { Echeance } from 'src/subscription/domain/entities/echeance';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { InvestmentEntity } from '../persistence/entities/investment.entity';
import { EcheanceEntity } from '../persistence/entities/echeance.entity';
import { InvestmentOrmMapper } from '../persistence/mappers/investment.orm-mapper';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';

@Injectable()
export class TypeOrmInvestmentRepository implements InvestmentRepository {
  constructor(
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
  ) {}

  async saveInvestment(investment: Investment): Promise<Investment> {
    const entity = InvestmentOrmMapper.toEntity(investment);
    const saved = await this.investRepo.save(entity);
    return InvestmentOrmMapper.toDomain(saved);
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
    return entity ? InvestmentOrmMapper.toDomain(entity) : null;
  }

  async findByUserId(userId: number): Promise<Investment[]> {
    const entities = await this.withProjet()
      .where('inv.utilisateurId = :userId', { userId })
      .orderBy('inv.createdAt', 'DESC')
      .getMany();
    return entities.map(InvestmentOrmMapper.toDomain);
  }

  async findByProjetId(projetId: string): Promise<Investment[]> {
    const entities = await this.withProjet()
      .where('inv.projetId = :projetId', { projetId })
      .orderBy('inv.createdAt', 'ASC')
      .getMany();
    return entities.map(InvestmentOrmMapper.toDomain);
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
    return InvestmentOrmMapper.toDomain(updated);
  }

  async updateBulletinDocId(investmentId: string, bulletinDocId: string): Promise<void> {
    await this.investRepo.update(investmentId, { bulletinDocId });
  }

  async updateTopUp(id: string, nbTitresTotal: number, montantTotal: number): Promise<Investment> {
    await this.investRepo.update(id, { nbTitres: nbTitresTotal, montant: montantTotal });
    const updated = await this.withProjet().where('inv.id = :id', { id }).getOneOrFail();
    return InvestmentOrmMapper.toDomain(updated);
  }

  async deleteEcheancesByInvestissementId(investissementId: string): Promise<void> {
    await this.echeanceRepo.delete({ investissementId });
  }

  async saveEcheances(echeances: Echeance[]): Promise<Echeance[]> {
    const entities = echeances.map(InvestmentOrmMapper.echeanceToEntity);
    const saved = await this.echeanceRepo.save(entities);
    return saved.map(InvestmentOrmMapper.echeanceToDomain);
  }

  async findEcheancesByInvestissement(
    investissementId: string,
  ): Promise<Echeance[]> {
    const entities = await this.echeanceRepo.find({
      where: { investissementId },
      order: { numero: 'ASC' },
    });
    return entities.map(InvestmentOrmMapper.echeanceToDomain);
  }
}
