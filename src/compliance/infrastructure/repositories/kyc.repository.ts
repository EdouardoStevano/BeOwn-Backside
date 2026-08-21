import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycRepository } from 'src/compliance/domain/repositories/kyc.repository';
import { Kyc, KycIdentiteExtrait } from 'src/compliance/domain/aggregates/kyc';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';
import { KycEntity } from '../persistence/entities/kyc.entity';
import { KycOrmMapper } from '../persistence/mappers/kyc.mapper';

@Injectable()
export class KycTypeOrmRepository implements KycRepository {
  constructor(
    @InjectRepository(KycEntity)
    private readonly kycRepo: Repository<KycEntity>,
  ) {}

  async save(kyc: Kyc): Promise<Kyc> {
    const entity = KycOrmMapper.toEntity(kyc);
    const saved = await this.kycRepo.save(entity);
    return KycOrmMapper.toDomain(saved);
  }

  async findByUserId(userId: number): Promise<Kyc | null> {
    const entity = await this.kycRepo.findOne({
      where: { utilisateurId: userId },
    });
    return entity ? KycOrmMapper.toDomain(entity) : null;
  }

  async findAll(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ items: Kyc[]; total: number }> {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
    // Aucune jointure vers `users` : le dossier ne rend que ce dont il est
    // propriétaire. Le titulaire est ajouté par `GetKycUseCase.executeAll`, via
    // le port d'IAM.
    const [entities, total] = await this.kycRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: entities.map((e) => KycOrmMapper.toDomain(e)), total };
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
    return KycOrmMapper.toDomain(updated);
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
    return KycOrmMapper.toDomain(updated);
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
    return KycOrmMapper.toDomain(updated);
  }
}
