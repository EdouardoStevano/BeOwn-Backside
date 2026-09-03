import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { DistributionPart } from '../../../domains/distribution-part';
import { DistributionPartRepository } from '../../../applications/ports/repositories/distribution-part.repository';
import { DistributionPartEntity } from '../entities/distribution-part.entity';
import { DistributionPartMapper } from '../mappers/distribution-part.mapper';
// Jointure inter-contextes assumée au niveau INFRASTRUCTURE uniquement :
// la couche application ne connaît que le port, pas cette entité.
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';

@Injectable()
export class DistributionPartTypeOrmRepository implements DistributionPartRepository {
  constructor(
    @InjectRepository(DistributionPartEntity)
    private readonly repo: Repository<DistributionPartEntity>,
  ) {}

  async saveAll(parts: DistributionPart[]): Promise<DistributionPart[]> {
    const entities = parts.map(DistributionPartMapper.toEntity);
    const saved = await this.repo.save(entities);
    return saved.map(DistributionPartMapper.toDomain);
  }

  async findByPeriode(
    periodeDistributionId: string,
  ): Promise<DistributionPart[]> {
    const list = await this.repo.find({ where: { periodeDistributionId } });
    return list.map(DistributionPartMapper.toDomain);
  }

  async findByInvestissement(
    investissementId: string,
  ): Promise<DistributionPart[]> {
    const list = await this.repo.find({
      where: { investissementId },
      order: { createdAt: 'DESC' },
    });
    return list.map(DistributionPartMapper.toDomain);
  }

  async findByInvestissementIds(
    investissementIds: string[],
  ): Promise<DistributionPart[]> {
    if (investissementIds.length === 0) return [];
    const list = await this.repo.find({
      where: { investissementId: In(investissementIds) },
      order: { createdAt: 'DESC' },
    });
    return list.map(DistributionPartMapper.toDomain);
  }

  async findUnpaid(): Promise<DistributionPart[]> {
    const list = await this.repo.find({ where: { payeLe: IsNull() } });
    return list.map(DistributionPartMapper.toDomain);
  }

  async markPaid(id: string, payeLe: Date): Promise<void> {
    await this.repo.update({ id }, { payeLe });
  }

  async findUtilisateurIdsAvecPartPayeeSurAnnee(
    annee: number,
  ): Promise<number[]> {
    // Bornes UTC de l'année civile : [1er janvier N, 1er janvier N+1[.
    // payeLe est un timestamptz — borne haute exclusive pour ne pas capturer
    // le 1er janvier de l'exercice suivant.
    const debut = new Date(Date.UTC(annee, 0, 1));
    const fin = new Date(Date.UTC(annee + 1, 0, 1));

    // UNE seule requête : la jointure remonte au propriétaire de
    // l'investissement et le DISTINCT est fait côté SQL (pas de N+1, pas de
    // dédoublonnage en mémoire). QueryBuilder sur les entités et paramètres
    // nommés : jamais de SQL concaténé, et les noms de colonnes restent en
    // camelCase quoté (le projet n'a aucune namingStrategy TypeORM).
    // Les parts non payées (payeLe NULL) sont écartées d'office par les
    // comparaisons SQL.
    const rows = await this.repo
      .createQueryBuilder('dp')
      .innerJoin(InvestmentEntity, 'inv', 'inv.id = dp.investissementId')
      .select('DISTINCT inv.utilisateurId', 'utilisateurId')
      .where('dp.payeLe >= :debut', { debut })
      .andWhere('dp.payeLe < :fin', { fin })
      .orderBy('inv.utilisateurId', 'ASC')
      .getRawMany<{ utilisateurId: number }>();

    // Le driver peut renvoyer les entiers en chaîne selon le type de colonne :
    // on normalise pour respecter le contrat `number[]` du port.
    return rows.map((row) => Number(row.utilisateurId));
  }
}
