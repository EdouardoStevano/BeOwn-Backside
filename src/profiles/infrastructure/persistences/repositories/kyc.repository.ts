import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycRepository } from 'src/profiles/domains/ports/kyc.repository';
import { Kyc, KycIdentiteExtrait } from 'src/profiles/domains/kyc';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';
import { KycEntity } from '../entities/kyc.entity';
import { ProfilMapper } from '../mappers/profil.mapper';

@Injectable()
export class KycTypeOrmRepository implements KycRepository {
  constructor(
    @InjectRepository(KycEntity)
    private readonly kycRepo: Repository<KycEntity>,
  ) {}

  async save(kyc: Kyc): Promise<Kyc> {
    const entity = ProfilMapper.kycToEntity(kyc);
    const saved = await this.kycRepo.save(entity);
    return ProfilMapper.kycToDomain(saved);
  }

  async findByUserId(userId: number): Promise<Kyc | null> {
    const entity = await this.kycRepo.findOne({
      where: { utilisateurId: userId },
    });
    return entity ? ProfilMapper.kycToDomain(entity) : null;
  }

  async findAll(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ items: Kyc[]; total: number }> {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
    const [entities, total] = await this.kycRepo.findAndCount({
      relations: ['utilisateur', 'utilisateur.userEmail'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: entities.map((e) => ProfilMapper.kycToDomain(e)), total };
  }

  async updateStatus(
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

  async updateSession(
    kycId: string,
    sessionId: string,
    status: KycStatus,
  ): Promise<Kyc> {
    await this.kycRepo.update(kycId, {
      fournisseurRef: sessionId,
      fournisseur: 'stripeIdentity',
      statut: status,
    });
    const updated = await this.kycRepo.findOneOrFail({ where: { id: kycId } });
    return ProfilMapper.kycToDomain(updated);
  }

  async updateReportData(
    kycId: string,
    reportId: string,
    identiteExtrait: KycIdentiteExtrait,
  ): Promise<Kyc> {
    await this.kycRepo.update(kycId, {
      stripeReportId: reportId,
      identiteExtrait,
    } as any);
    const updated = await this.kycRepo.findOneOrFail({ where: { id: kycId } });
    return ProfilMapper.kycToDomain(updated);
  }
}
