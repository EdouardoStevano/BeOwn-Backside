import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvestmentRepository } from 'src/subscription/domain/repositories/investment.repository';
import {
  Investment,
  type InvestmentNaissant,
} from 'src/subscription/domain/aggregates/investment';
import {
  Echeance,
  type EcheanceNaissante,
} from 'src/servicing/domain/entities/echeance';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { InvestmentEntity } from '../persistence/entities/investment.entity';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { InvestmentOrmMapper } from '../persistence/mappers/investment.orm-mapper';
import { EcheanceOrmMapper } from 'src/servicing/infrastructure/persistence/mappers/echeance.orm-mapper';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';

/** Statuts qui ne pèsent plus sur la collecte — le filtre du recompte de fractions. */
const STATUTS_INACTIFS = [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE];

@Injectable()
export class TypeOrmInvestmentRepository implements InvestmentRepository {
  constructor(
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
  ) {}

  async creer(naissant: InvestmentNaissant): Promise<Investment> {
    const saved = await this.investRepo.save(
      InvestmentOrmMapper.naissantToEntity(naissant),
    );
    return InvestmentOrmMapper.toDomain(saved);
  }

  async save(investment: Investment): Promise<Investment> {
    const saved = await this.investRepo.save(
      InvestmentOrmMapper.toEntity(investment),
    );
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

  async findById(id: string): Promise<Investment | null> {
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
      .andWhere('i.statut NOT IN (:...exclus)', { exclus: STATUTS_INACTIFS })
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
      .andWhere('i.statut NOT IN (:...exclus)', { exclus: STATUTS_INACTIFS })
      .groupBy('i.projetId')
      .getRawMany<{ projetId: string; total: string }>();
    return Object.fromEntries(rows.map((r) => [r.projetId, Number(r.total)]));
  }

  async deleteEcheancesByInvestissementId(
    investissementId: string,
  ): Promise<void> {
    await this.echeanceRepo.delete({ investissementId });
  }

  async saveEcheances(echeances: EcheanceNaissante[]): Promise<Echeance[]> {
    const saved = await this.echeanceRepo.save(
      echeances.map(EcheanceOrmMapper.naissanteToEntity),
    );
    return saved.map(EcheanceOrmMapper.toDomain);
  }

  async findEcheancesByInvestissement(
    investissementId: string,
  ): Promise<Echeance[]> {
    const entities = await this.echeanceRepo.find({
      where: { investissementId },
      order: { numero: 'ASC' },
    });
    return entities.map(EcheanceOrmMapper.toDomain);
  }
}
