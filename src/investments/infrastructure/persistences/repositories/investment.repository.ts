import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgregatInvestissementsProjet,
  InvestmentRepository,
} from 'src/investments/applications/ports/repositories/investment.repository';
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

  async agregerParProjet(
    projetIds: string[],
    statuts: InvestmentStatus[],
  ): Promise<Record<string, AgregatInvestissementsProjet>> {
    if (projetIds.length === 0 || statuts.length === 0) return {};
    // UNE requête pour tous les projets, et RIEN d'autre que les agrégats :
    // pas de jointure sur `projet`, donc pas de blob `fici` ni de
    // `descriptionMd` rapatriés par ligne. S'appuie sur l'index
    // `investissement.projetId` (voir InvestmentEntity), le même que
    // countFractionsVenduesBatch.
    const rows = await this.investRepo
      .createQueryBuilder('i')
      .select('i.projetId', 'projetId')
      .addSelect('COALESCE(SUM(i.montant), 0)', 'montant')
      .addSelect('COUNT(DISTINCT i.utilisateurId)', 'investisseurs')
      .where('i.projetId IN (:...projetIds)', { projetIds })
      .andWhere('i.statut IN (:...statuts)', { statuts })
      .groupBy('i.projetId')
      .getRawMany<{
        projetId: string;
        montant: string;
        investisseurs: string;
      }>();

    return Object.fromEntries(
      rows.map((r) => [
        r.projetId,
        {
          montantCollecte: Number(r.montant),
          nbInvestisseurs: Number(r.investisseurs),
        },
      ]),
    );
  }

  async existeDetentionSurSocieteSupport(
    utilisateurId: number,
    spvId: string,
  ): Promise<boolean> {
    // Part de l'index `investment.utilisateurId`, puis joint le projet par sa
    // clé primaire : le volume balayé est celui du portefeuille de l'appelant,
    // jamais celui de la table. `getExists` s'arrête au premier enregistrement.
    return this.investRepo
      .createQueryBuilder('i')
      .innerJoin(ProjectEntity, 'p', 'p.id = i."projetId"')
      .where('i.utilisateurId = :utilisateurId', { utilisateurId })
      .andWhere('p.spvId = :spvId', { spvId })
      .andWhere('i.statut NOT IN (:...exclus)', {
        exclus: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE],
      })
      .getExists();
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

  async updateTopUp(id: string, nbTitresTotal: number, montantTotal: number): Promise<Investment> {
    await this.investRepo.update(id, { nbTitres: nbTitresTotal, montant: montantTotal });
    const updated = await this.withProjet().where('inv.id = :id', { id }).getOneOrFail();
    return InvestmentMapper.toDomain(updated);
  }

  async deleteEcheancesByInvestissementId(investissementId: string): Promise<void> {
    await this.echeanceRepo.delete({ investissementId });
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
