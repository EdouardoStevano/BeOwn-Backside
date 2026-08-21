import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/compliance/domain/repositories/kyc.repository';
import { KycCase } from 'src/compliance/domain/entities/kyc-case';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';

@Injectable()
export class UpdateKycStatusUseCase {
  constructor(
    @Inject(KYC_REPOSITORY)
    private readonly kycRepository: KycRepository,
  ) {}

  async execute(
    userId: number,
    status: KycStatus,
    motifRefus?: string,
  ): Promise<KycCase> {
    const kyc = await this.kycRepository.findByUserId(userId);
    if (!kyc) throw new NotFoundException('KYC introuvable.');

    return this.kycRepository.updateStatus(kyc.id, status, motifRefus);
  }
}
