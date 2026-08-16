import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfilPPRepository } from 'src/profiles/domains/ports/profil-pp.repository';
import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { ProfilPPEntity } from '../entities/profil-pp.entity';
import { ProfilMapper } from '../mappers/profil.mapper';

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
    const entity = await this.ppRepo.findOne({
      where: { utilisateurId: userId },
    });
    return entity ? ProfilMapper.ppToDomain(entity) : null;
  }

  /**
   * Identique à {@link save} — `utilisateurId` étant la clé primaire, TypeORM
   * fait un UPDATE dès que la ligne existe. Les deux méthodes restent
   * distinctes au port parce que l'intention de l'appelant, elle, diffère :
   * créer un profil qui existe déjà est un conflit, le mettre à jour est
   * normal, et c'est le use case qui tranche.
   */
  update(profil: ProfilPP): Promise<ProfilPP> {
    return this.save(profil);
  }
}
