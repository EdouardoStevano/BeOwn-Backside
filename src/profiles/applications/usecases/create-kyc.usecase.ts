import { Inject, Injectable } from '@nestjs/common';
import { PROFIL_REPOSITORY } from '../ports/repositories/profil.repository';
import type { ProfilRepository } from '../ports/repositories/profil.repository';
import { Kyc } from 'src/profiles/domains/kyc';
import {
  KycNiveau,
  KycStatus,
} from 'src/profiles/domains/enums/kyc-status.enum';

@Injectable()
export class CreateKycUseCase {
  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
  ) {}

  async execute(userId: number): Promise<Kyc> {
    const existing = await this.profilRepository.findKycByUserId(userId);
    if (existing) return existing;

    const kyc = new Kyc();
    kyc.utilisateurId = userId;
    kyc.statut = KycStatus.NON_DEMARRE;
    kyc.niveau = KycNiveau.STANDARD;
    kyc.fournisseur = 'stripe';
    kyc.scoreRisque = null;
    kyc.fournisseurRef = null;
    kyc.valideJusquAu = null;
    kyc.motifRefus = null;

    return this.profilRepository.saveKyc(kyc);
  }
}
