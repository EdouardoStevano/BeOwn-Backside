import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvisEntity } from '../entities/avis.entity';
import { AvisRepository } from 'src/avis/applications/ports/repositories/avis.repository';
import { Avis } from 'src/avis/domains/avis';

@Injectable()
export class AvisTypeOrmRepository implements AvisRepository {
  constructor(
    @InjectRepository(AvisEntity)
    private readonly repo: Repository<AvisEntity>,
  ) {}

  async save(avis: Avis): Promise<Avis> {
    // If avis has an id, update the existing record; otherwise insert
    const entity = avis.id
      ? await this.repo.findOne({ where: { id: avis.id } }).then((e) =>
          Object.assign(e ?? this.repo.create(), {
            note: avis.note,
            commentaire: avis.commentaire ?? null,
          }),
        )
      : this.repo.create({
          projetId: avis.projetId,
          userId: avis.userId,
          note: avis.note,
          commentaire: avis.commentaire ?? null,
        });
    const saved = await this.repo.save(entity);
    return this.toAvis(saved);
  }

  async findByProjetId(projetId: string): Promise<Avis[]> {
    const rows = await this.repo
      .createQueryBuilder('a')
      .leftJoin('users', 'u', 'u.userid = a.user_id')
      .where('a.projet_id = :projetId', { projetId })
      .orderBy('a.created_at', 'DESC')
      .select([
        'a.id AS id',
        'a.projet_id AS "projetId"',
        'a.user_id AS "userId"',
        'a.note AS note',
        'a.commentaire AS commentaire',
        'a.created_at AS "createdAt"',
        'u.firstname AS "userFirstname"',
        'u.lastname AS "userLastname"',
      ])
      .getRawMany();
    return rows.map((r) => {
      const avis = new Avis();
      avis.id = r.id;
      avis.projetId = r.projetId;
      avis.userId = Number(r.userId);
      avis.note = Number(r.note);
      avis.commentaire = r.commentaire;
      avis.createdAt = r.createdAt;
      avis.userFirstname = r.userFirstname ?? null;
      avis.userLastname = r.userLastname ?? null;
      return avis;
    });
  }

  async findByUserAndProjet(
    userId: number,
    projetId: string,
  ): Promise<Avis | null> {
    const entity = await this.repo.findOne({ where: { userId, projetId } });
    return entity ? this.toAvis(entity) : null;
  }

  async getStats(
    projetId: string,
  ): Promise<{ noteMoyenne: number; nbAvis: number }> {
    const result = await this.repo
      .createQueryBuilder('a')
      .select('AVG(a.note)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('a.projetId = :projetId', { projetId })
      .getRawOne();
    return {
      noteMoyenne: result?.avg ? Math.round(Number(result.avg) * 10) / 10 : 0,
      nbAvis: Number(result?.count ?? 0),
    };
  }

  private toAvis(e: AvisEntity): Avis {
    const avis = new Avis();
    avis.id = e.id;
    avis.projetId = e.projetId;
    avis.userId = e.userId;
    avis.note = e.note;
    avis.commentaire = e.commentaire;
    avis.createdAt = e.createdAt;
    return avis;
  }
}
