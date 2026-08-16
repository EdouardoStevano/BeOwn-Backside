import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfilPMRepository } from 'src/profiles/domains/ports/profil-pm.repository';
import { ProfilPM } from 'src/profiles/domains/profil-pm';
import { ProfilPMEntity } from '../entities/profil-pm.entity';
import { ProfilMapper } from '../mappers/profil.mapper';

@Injectable()
export class ProfilPMTypeOrmRepository implements ProfilPMRepository {
  constructor(
    @InjectRepository(ProfilPMEntity)
    private readonly pmRepo: Repository<ProfilPMEntity>,
  ) {}

  async save(profil: ProfilPM): Promise<ProfilPM> {
    const entity = ProfilMapper.pmToEntity(profil);
    const saved = await this.pmRepo.save(entity);
    return ProfilMapper.pmToDomain(saved);
  }

  async findByUserId(userId: number): Promise<ProfilPM | null> {
    const entity = await this.pmRepo.findOne({
      where: { utilisateurId: userId },
    });
    return entity ? ProfilMapper.pmToDomain(entity) : null;
  }

  /**
   * Identique à {@link save} — `utilisateurId` étant la clé primaire, TypeORM
   * fait un UPDATE dès que la ligne existe. Les deux méthodes restent
   * distinctes au port parce que l'intention de l'appelant, elle, diffère.
   */
  update(profil: ProfilPM): Promise<ProfilPM> {
    return this.save(profil);
  }
}
