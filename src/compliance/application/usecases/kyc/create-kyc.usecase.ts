import { Inject, Injectable } from '@nestjs/common';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { KycFactory } from 'src/compliance/domain/factories/kyc.factory';
import {
  INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
  type InvestorComplianceProfileRepository,
} from 'src/compliance/domain/repositories/investor-compliance-profile.repository';

/**
 * Ouvre le dossier de vérification d'un titulaire, s'il n'en a pas déjà un.
 *
 * **Idempotent** : un second appel rend le dossier existant sans rien écrire.
 * C'est ce qui permet à `StartKycSessionUseCase` de l'appeler sans se demander
 * si le titulaire a déjà commencé, et à une reprise de parcours de ne pas
 * effacer ce qui a été vérifié.
 *
 * Il passait par un `KycRepository` propre à l'entité `KycCase` ; il passe
 * désormais par la racine, seule à savoir si le titulaire a un dossier et
 * seule habilitée à lui en déposer un (§6, §10).
 */
@Injectable()
export class CreateKycUseCase {
  constructor(
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly profils: InvestorComplianceProfileRepository,
  ) {}

  async execute(userId: number): Promise<InvestorComplianceProfile> {
    const profil = await this.profils.findByInvestorId(userId);
    if (profil.aUnDossierKyc()) return profil;

    profil.deposerDossierKyc(KycFactory.creer());
    return this.profils.save(profil);
  }
}
