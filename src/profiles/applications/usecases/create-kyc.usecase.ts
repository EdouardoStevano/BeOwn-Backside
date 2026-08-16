import { Inject, Injectable } from '@nestjs/common';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/profiles/domains/ports/kyc.repository';
import { Kyc } from 'src/profiles/domains/kyc';
import {
  KycNiveau,
  KycStatus,
} from 'src/profiles/domains/enums/kyc-status.enum';

@Injectable()
export class CreateKycUseCase {
  constructor(
    @Inject(KYC_REPOSITORY)
    private readonly kycRepository: KycRepository,
  ) {}

  async execute(userId: number): Promise<Kyc> {
    const existing = await this.kycRepository.findByUserId(userId);
    if (existing) return existing;

    const kyc = new Kyc();
    kyc.utilisateurId = userId;
    kyc.statut = KycStatus.NON_DEMARRE;
    kyc.niveau = KycNiveau.STANDARD;
    kyc.fournisseur = 'stripeIdentity';
    kyc.scoreRisque = null;
    kyc.fournisseurRef = null;
    kyc.valideJusquAu = null;
    kyc.motifRefus = null;

    return this.kycRepository.save(kyc);
  }
}
