import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PROFIL_REPOSITORY } from '../ports/repositories/profil.repository';
import type { ProfilRepository } from '../ports/repositories/profil.repository';
import { Kyc } from 'src/profiles/domains/kyc';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';
import { SanctionsScreeningPort } from 'src/common/aml/sanctions-screening.port';

@Injectable()
export class UpdateKycStatusUseCase {
  private readonly logger = new Logger(UpdateKycStatusUseCase.name);

  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
    // Screening de la liste de gel au passage VALIDE — port DIP (module aml),
    // en dernière position de constructeur (specs construisent à la main).
    private readonly sanctionsScreening: SanctionsScreeningPort,
  ) {}

  async execute(
    userId: number,
    status: KycStatus,
    motifRefus?: string,
  ): Promise<Kyc> {
    const kyc = await this.profilRepository.findKycByUserId(userId);
    if (!kyc) throw new NotFoundException('KYC introuvable.');

    const updated = await this.profilRepository.updateKycStatus(
      kyc.id,
      status,
      motifRefus,
    );

    // ── Screening gel des avoirs (L. 562-4 CMF) — au passage VALIDE ──────────
    // Point unique de la machine à états : couvre la validation automatique
    // (webhook Stripe Identity) ET la décision manuelle admin, qui passent
    // toutes deux par ce usecase. Best-effort par contrat de port : une
    // correspondance CRÉE UNE ALERTE compliance, elle ne gèle jamais seule et
    // ne remet pas en cause la validation.
    if (status === KycStatus.VALIDE) {
      this.sanctionsScreening.screenUser(userId).catch((err) =>
        this.logger.warn(
          `Screening post-validation KYC impossible pour userId=${userId}: ${err?.message}`,
        ),
      );
    }

    return updated;
  }
}
