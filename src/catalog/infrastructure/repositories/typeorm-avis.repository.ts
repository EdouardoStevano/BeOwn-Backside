import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvisEntity } from '../persistence/entities/avis.entity';
import {
  AvisOrmMapper,
  type AvisAvecAuteur,
} from '../persistence/mappers/avis.orm-mapper';
import type { AvisRepository } from 'src/catalog/domain/repositories/avis.repository';
import type { Avis, AvisNaissant } from 'src/catalog/domain/aggregates/avis';
import { AvisIntrouvableError } from 'src/catalog/domain/errors';

type StatsRawRow = {
  avg: string | null;
  count: string;
};

/** L'adapter TypeORM du port `AvisRepository` (§33). */
@Injectable()
export class TypeOrmAvisRepository implements AvisRepository {
  constructor(
    @InjectRepository(AvisEntity)
    private readonly repo: Repository<AvisEntity>,
  ) {}

  async creer(naissant: AvisNaissant): Promise<Avis> {
    const saved = await this.repo.save(
      AvisOrmMapper.naissantToEntity(naissant),
    );
    return AvisOrmMapper.toDomain(saved);
  }

  async save(avis: Avis): Promise<Avis> {
    const ligne = await this.repo.findOne({ where: { id: avis.id } });
    if (!ligne) throw new AvisIntrouvableError();

    const saved = await this.repo.save(AvisOrmMapper.appliquerSur(ligne, avis));
    return AvisOrmMapper.toDomain(saved);
  }

  async findByProjetId(projetId: string): Promise<Avis[]> {
    const rows = await this.repo
      .createQueryBuilder('a')
      .leftJoin('users', 'u', 'u."userId" = a."userId"')
      .where('a."projetId" = :projetId', { projetId })
      .orderBy('a."createdAt"', 'DESC')
      .select([
        'a.id AS id',
        'a."projetId" AS "projetId"',
        'a."userId" AS "userId"',
        'a.note AS note',
        'a.commentaire AS commentaire',
        'a."createdAt" AS "createdAt"',
        'u.firstname AS "userFirstname"',
        'u.lastname AS "userLastname"',
      ])
      .getRawMany<AvisAvecAuteur>();
    return rows.map(AvisOrmMapper.toDomain);
  }

  async findByUserAndProjet(
    userId: number,
    projetId: string,
  ): Promise<Avis | null> {
    const entity = await this.repo.findOne({ where: { userId, projetId } });
    return entity ? AvisOrmMapper.toDomain(entity) : null;
  }

  async getStats(
    projetId: string,
  ): Promise<{ noteMoyenne: number; nbAvis: number }> {
    const result = await this.repo
      .createQueryBuilder('a')
      .select('AVG(a.note)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('a.projetId = :projetId', { projetId })
      .getRawOne<StatsRawRow>();
    return {
      noteMoyenne: result?.avg ? Math.round(Number(result.avg) * 10) / 10 : 0,
      nbAvis: Number(result?.count ?? 0),
    };
  }
}
