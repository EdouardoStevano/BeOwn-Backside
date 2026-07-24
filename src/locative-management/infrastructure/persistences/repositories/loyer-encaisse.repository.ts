import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoyerEncaisse } from '../../../domains/loyer-encaisse';
import { LoyerEncaisseRepository } from '../../../applications/ports/repositories/loyer-encaisse.repository';
import { LoyerEncaisseEntity } from '../entities/loyer-encaisse.entity';
import { BailEntity } from '../entities/bail.entity';
import { UniteLouableEntity } from '../entities/unite-louable.entity';
import { LoyerEncaisseMapper } from '../mappers/loyer-encaisse.mapper';
import { StatutDeclaration } from '../../../domains/enums/statut-declaration.enum';

@Injectable()
export class LoyerEncaisseTypeOrmRepository implements LoyerEncaisseRepository {
  constructor(
    @InjectRepository(LoyerEncaisseEntity)
    private readonly repo: Repository<LoyerEncaisseEntity>,
  ) {}

  async save(l: LoyerEncaisse): Promise<LoyerEncaisse> {
    return LoyerEncaisseMapper.toDomain(
      await this.repo.save(LoyerEncaisseMapper.toEntity(l)),
    );
  }

  async findById(id: string): Promise<LoyerEncaisse | null> {
    const f = await this.repo.findOne({ where: { id } });
    return f ? LoyerEncaisseMapper.toDomain(f) : null;
  }

  async findByBailEtPeriode(
    bailId: string,
    periode: string,
  ): Promise<LoyerEncaisse | null> {
    const f = await this.repo.findOne({ where: { bailId, periode } });
    return f ? LoyerEncaisseMapper.toDomain(f) : null;
  }

  async findByStatut(statut: StatutDeclaration): Promise<LoyerEncaisse[]> {
    const list = await this.repo.find({ where: { statut } });
    return list.map(LoyerEncaisseMapper.toDomain);
  }

  async findValidesParProjetEtPeriode(
    projetId: string,
    periode: string,
  ): Promise<LoyerEncaisse[]> {
    const list = await this.repo
      .createQueryBuilder('le')
      .innerJoin(BailEntity, 'b', 'b.id = le.bailId')
      .innerJoin(UniteLouableEntity, 'u', 'u.id = b.uniteLouableId')
      .where('u.projetId = :projetId', { projetId })
      .andWhere('le.periode = :periode', { periode })
      .andWhere('le.statut = :statut', { statut: StatutDeclaration.VALIDE })
      .getMany();
    return list.map(LoyerEncaisseMapper.toDomain);
  }
}
