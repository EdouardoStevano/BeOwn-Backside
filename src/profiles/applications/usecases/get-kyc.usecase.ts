import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/profiles/domains/ports/kyc.repository';

@Injectable()
export class GetKycUseCase {
  constructor(
    @Inject(KYC_REPOSITORY) private readonly kycRepository: KycRepository,
  ) {}

  async execute(userId: number) {
    const kyc = await this.kycRepository.findByUserId(userId);
    if (!kyc) {
      throw new NotFoundException('KYC non trouvé');
    }
    return kyc;
  }

  async executeAll(params?: { page?: number; limit?: number }) {
    return this.kycRepository.findAll(params);
  }
}
