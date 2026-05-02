import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PROFIL_REPOSITORY } from '../ports/repositories/profil.repository';
import type { ProfilRepository } from '../ports/repositories/profil.repository';
import { Kyc } from 'src/profiles/domains/kyc';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';

@Injectable()
export class UpdateKycStatusUseCase {
  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
  ) {}

  async execute(
    userId: number,
    status: KycStatus,
    motifRefus?: string,
  ): Promise<Kyc> {
    const kyc = await this.profilRepository.findKycByUserId(userId);
    if (!kyc) throw new NotFoundException('KYC introuvable.');

    return this.profilRepository.updateKycStatus(kyc.id, status, motifRefus);
  }
}
