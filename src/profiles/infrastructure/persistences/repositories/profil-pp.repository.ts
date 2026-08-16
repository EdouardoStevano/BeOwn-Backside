import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { NiveauRisque } from 'src/profiles/domains/enums/niveau-risque.enum';
import {
  ClassementPsfp,
  ProfilPPRepository,
  SuiviRisque,
} from 'src/profiles/domains/ports/profil-pp.repository';
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

  /**
   * `update` et non `save` : une mise à jour ciblée ne touche que ces colonnes,
   * là où `save` réécrirait toute la ligne — y compris ce qu'un autre chemin
   * aurait modifié entre-temps. Sans effet si la ligne n'existe pas, ce que le
   * port annonce.
   */
  async enregistrerClassementPsfp(
    utilisateurId: number,
    classement: ClassementPsfp,
  ): Promise<void> {
    await this.ppRepo.update(
      { utilisateurId },
      {
        categoriePsfp: classement.categoriePsfp,
        patrimoineDeclare: classement.patrimoineDeclare,
        montantMaxConseille: classement.montantMaxConseille,
      },
    );
  }

  async enregistrerSuiviRisque(
    utilisateurId: number,
    suivi: SuiviRisque,
  ): Promise<void> {
    await this.ppRepo.update(
      { utilisateurId },
      {
        niveauRisque: suivi.niveauRisque,
        prochainContactDu: suivi.prochainContactDu,
      },
    );
  }

  async listerContactsDus(limite: number): Promise<ProfilPP[]> {
    const entities = await this.ppRepo.find({
      where: [
        { prochainContactDu: LessThan(new Date()) },
        { prochainContactDu: IsNull(), niveauRisque: NiveauRisque.VULNERABLE },
      ],
      take: limite,
    });
    return entities.map((entity) => ProfilMapper.ppToDomain(entity));
  }
}
