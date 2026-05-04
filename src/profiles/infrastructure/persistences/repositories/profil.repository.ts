import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfilRepository } from 'src/profiles/applications/ports/repositories/profil.repository';
import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { ProfilPM } from 'src/profiles/domains/profil-pm';
import { Kyc } from 'src/profiles/domains/kyc';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';
import { ProfilPPEntity } from '../entities/profil-pp.entity';
import { ProfilPMEntity } from '../entities/profil-pm.entity';
import { KycEntity } from '../entities/kyc.entity';
import { ProfilMapper } from '../mappers/profil.mapper';

@Injectable()
export class ProfilTypeOrmRepository implements ProfilRepository {
  constructor(
    @InjectRepository(ProfilPPEntity)
    private readonly ppRepo: Repository<ProfilPPEntity>,
    @InjectRepository(ProfilPMEntity)
    private readonly pmRepo: Repository<ProfilPMEntity>,
    @InjectRepository(KycEntity)
    private readonly kycRepo: Repository<KycEntity>,
  ) {}

  async saveProfilPP(profil: ProfilPP): Promise<ProfilPP> {
    const entity = ProfilMapper.ppToEntity(profil);
    const saved = await this.ppRepo.save(entity);
    return ProfilMapper.ppToDomain(saved);
  }

  async findProfilPPByUserId(userId: number): Promise<ProfilPP | null> {
    const entity = await this.ppRepo.findOne({
      where: { utilisateurId: userId },
    });
    return entity ? ProfilMapper.ppToDomain(entity) : null;
  }

  async updateProfilPP(profil: ProfilPP): Promise<ProfilPP> {
    const entity = ProfilMapper.ppToEntity(profil);
    const saved = await this.ppRepo.save(entity);
    return ProfilMapper.ppToDomain(saved);
  }

  async saveProfilPM(profil: ProfilPM): Promise<ProfilPM> {
    const entity = ProfilMapper.pmToEntity(profil);
    const saved = await this.pmRepo.save(entity);
    return ProfilMapper.pmToDomain(saved);
  }

  async findProfilPMByUserId(userId: number): Promise<ProfilPM | null> {
    const entity = await this.pmRepo.findOne({
      where: { utilisateurId: userId },
    });
    return entity ? ProfilMapper.pmToDomain(entity) : null;
  }

  async saveKyc(kyc: Kyc): Promise<Kyc> {
    const entity = ProfilMapper.kycToEntity(kyc);
    const saved = await this.kycRepo.save(entity);
    return ProfilMapper.kycToDomain(saved);
  }

  async findKycByUserId(userId: number): Promise<Kyc | null> {
    const entity = await this.kycRepo.findOne({
      where: { utilisateurId: userId },
    });
    return entity ? ProfilMapper.kycToDomain(entity) : null;
  }

  async updateKycStatus(
    kycId: string,
    status: KycStatus,
    motifRefus?: string,
  ): Promise<Kyc> {
    await this.kycRepo.update(kycId, {
      statut: status,
      motifRefus: motifRefus ?? null,
    });
    const updated = await this.kycRepo.findOneOrFail({ where: { id: kycId } });
    return ProfilMapper.kycToDomain(updated);
  }
}
