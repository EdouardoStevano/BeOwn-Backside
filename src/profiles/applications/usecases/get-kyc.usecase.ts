import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from '../ports/repositories/profil.repository';

@Injectable()
export class GetKycUseCase {
  constructor(
    @Inject(PROFIL_REPOSITORY) private readonly profilRepository: ProfilRepository,
  ) {}

  async execute(userId: number) {
    const kyc = await this.profilRepository.findKycByUserId(userId);
    if (!kyc) {
      throw new NotFoundException('KYC non trouvé');
    }
    return kyc;
  }

  async executeAll() {
    return this.profilRepository.findKycByUserId(0);
  }
}
