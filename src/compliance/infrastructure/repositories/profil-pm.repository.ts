import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfilPMRepository } from 'src/compliance/domain/repositories/profil-pm.repository';
import { ProfilPM } from 'src/compliance/domain/aggregates/profil-pm';
import { ProfilPMEntity } from '../persistence/entities/profil-pm.entity';
import { ProfilMapper } from '../persistence/mappers/profil.mapper';

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

  async findById(id: string): Promise<ProfilPM | null> {
    const entity = await this.pmRepo.findOne({ where: { id } });
    return entity ? ProfilMapper.pmToDomain(entity) : null;
  }

  async listerParUtilisateur(userId: number): Promise<ProfilPM[]> {
    const entities = await this.pmRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return entities.map((entity) => ProfilMapper.pmToDomain(entity));
  }

  /**
   * Identique à {@link save} — un dossier chargé porte son `id`, TypeORM fait
   * donc un UPDATE ; un dossier qui vient de naître ne l'a pas, et c'est un
   * INSERT. Les deux méthodes restent distinctes au port parce que l'intention
   * de l'appelant, elle, diffère.
   */
  update(profil: ProfilPM): Promise<ProfilPM> {
    return this.save(profil);
  }
}
