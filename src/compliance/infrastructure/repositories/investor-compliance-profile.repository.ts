import { Inject, Injectable } from '@nestjs/common';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import {
  KYC_REPOSITORY,
  type KycRepository,
} from 'src/compliance/domain/repositories/kyc.repository';
import { InvestorComplianceProfileRepository } from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import {
  QUESTIONNAIRE_ADEQUATION_REPOSITORY,
  type QuestionnaireAdequationRepository,
} from 'src/compliance/domain/repositories/questionnaire-adequation.repository';

/**
 * Compose la racine depuis les deux tables qui la portent.
 *
 * Il s'appuie sur les deux ports de pièce plutôt que sur TypeORM directement :
 * les mappers ORM de `kyc` et de `questionnaire_adequation` existent déjà et
 * sont éprouvés, les réécrire ici les mettrait en double. Ce que cet adapter
 * ajoute, c'est la **frontière transactionnelle** — charger les deux pièces
 * ensemble, les réenregistrer ensemble — et c'est tout ce que la racine
 * demande (§17).
 *
 * Limite assumée, à lever quand `save` deviendra le seul chemin d'écriture du
 * contexte : les deux enregistrements ne partagent pas encore une transaction
 * SQL. Ils sont indépendants — un questionnaire et un dossier de vérification
 * n'ont pas d'invariant croisé à l'écriture, seulement à la lecture — donc un
 * échec du second laisse le premier écrit, jamais un état interdit.
 */
@Injectable()
export class InvestorComplianceProfileTypeOrmRepository
  implements InvestorComplianceProfileRepository
{
  constructor(
    @Inject(KYC_REPOSITORY)
    private readonly dossiers: KycRepository,
    @Inject(QUESTIONNAIRE_ADEQUATION_REPOSITORY)
    private readonly questionnaires: QuestionnaireAdequationRepository,
  ) {}

  async findByInvestorId(
    investorId: number,
  ): Promise<InvestorComplianceProfile> {
    const [kycCase, adequacy] = await Promise.all([
      this.dossiers.findByUserId(investorId),
      this.questionnaires.findByUserId(investorId),
    ]);

    return new InvestorComplianceProfile({ investorId, kycCase, adequacy });
  }

  async save(
    profile: InvestorComplianceProfile,
  ): Promise<InvestorComplianceProfile> {
    const [kycCase, adequacy] = await Promise.all([
      profile.kycCase ? this.dossiers.save(profile.kycCase) : null,
      profile.adequacy ? this.questionnaires.save(profile.adequacy) : null,
    ]);

    return new InvestorComplianceProfile({
      investorId: profile.investorId,
      kycCase,
      adequacy,
    });
  }
}
