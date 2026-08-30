import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfilPPRepository } from 'src/onboarding/domain/repositories/profil-pp.repository';
import { ProfilPP } from 'src/onboarding/domain/aggregates/profil-pp';
import { ProfilPPEntity } from '../persistence/entities/profil-pp.entity';
import { ProfilMapper } from '../persistence/mappers/profil.mapper';

@Injectable()
export class ProfilPPTypeOrmRepository implements ProfilPPRepository {
  constructor(
    @InjectRepository(ProfilPPEntity)
    private readonly ppRepo: Repository<ProfilPPEntity>,
  ) {}

  async save(profil: ProfilPP): Promise<ProfilPP> {
    const entity = ProfilMapper.ppToEntity(profil);
    const saved = await this.ppRepo.save(entity);
    return ProfilMapper.ppToDomain(saved);
  }

  async findByUserId(userId: number): Promise<ProfilPP | null> {
    const entity = await this.ppRepo.findOne({ where: { userId } });
    return entity ? ProfilMapper.ppToDomain(entity) : null;
  }

  /**
   * Identique à {@link save} — un profil chargé porte son `id`, et TypeORM fait
   * donc un UPDATE ; un profil qui vient de naître ne l'a pas, et c'est un
   * INSERT. Les deux méthodes restent distinctes au port parce que l'intention
   * de l'appelant, elle, diffère : créer un profil qui existe déjà est un
   * conflit, le mettre à jour est normal, et c'est le use case qui tranche.
   */
  update(profil: ProfilPP): Promise<ProfilPP> {
    return this.save(profil);
  }
}
