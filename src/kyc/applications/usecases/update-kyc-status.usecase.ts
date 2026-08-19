import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/kyc/domains/ports/kyc.repository';
import { Kyc } from 'src/kyc/domains/kyc';
import { KycStatus } from 'src/kyc/domains/enums/kyc-status.enum';

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
  ): Promise<Kyc> {
    const kyc = await this.kycRepository.findByUserId(userId);
    if (!kyc) throw new NotFoundException('KYC introuvable.');

    return this.kycRepository.updateStatus(kyc.id, status, motifRefus);
  }
}
