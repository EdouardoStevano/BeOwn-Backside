import { Inject, Injectable } from '@nestjs/common';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { AdequacyAssessmentSnapshot } from 'src/compliance/domain/entities/adequacy-assessment';
import { QuestionnaireAdequationFactory } from 'src/compliance/domain/factories/questionnaire-adequation.factory';
import {
  INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
  type InvestorComplianceProfileRepository,
} from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/compliance/domain/repositories/profil-pp.repository';
import { SaveQuestionnaireDto } from 'src/compliance/presentation/http/dto/questionnaire.dto';
import { reponsesDepuisDto } from '../../mappers/questionnaire-reponses.mapper';
import { RiskScoringService } from '../../services/risk-scoring.service';

/**
 * Passage du questionnaire d'adéquation PSFP.
 *
 * Ce use case n'orchestre que des accès (§14) : relire l'éligibilité du
 * titulaire, lui donner les nouvelles réponses ou faire naître son
 * questionnaire, persister, puis reporter le classement là où il produit ses
 * effets. Le classement lui-même — trois étapes, trois seuils réglementaires et
 * le calcul du plafond conseillé — vit dans `ResultatAdequation`, où il se
 * teste sans base de données.
 *
 * Il passe par `InvestorComplianceProfile` et non plus par le questionnaire
 * seul : c'est la racine qui sait ce que le classement impose (RG-KYC-13), et
 * ce use case n'a plus à le recomposer champ par champ — il le lui demande.
 */
@Injectable()
export class SaveQuestionnaireUseCase {
  constructor(
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly profils: InvestorComplianceProfileRepository,
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    private readonly riskScoringService: RiskScoringService,
  ) {}

  async execute(
    userId: number,
    dto: SaveQuestionnaireDto,
  ): Promise<AdequacyAssessmentSnapshot> {
    const reponses = reponsesDepuisDto(dto);
    const profil = await this.profils.findByInvestorId(userId);

    profil.repondreAuQuestionnaire(reponses);

    const enregistre = await this.profils.save(profil);

    await this.reporterSurLeProfil(userId, enregistre);
    await this.riskScoringService.computeAndStore(userId);

    // Le questionnaire tel qu'il se publie, pas l'entité : le contrôleur ne
    // doit pas tenir de quoi appeler `repondre()` hors de la racine.
    return enregistre.questionnairePublie as AdequacyAssessmentSnapshot;
  }

  /**
   * Le classement vit en deux endroits : dans le questionnaire, qui en est la
   * pièce justificative, et sur le profil personne physique, que le reste de
   * l'application interroge — contrôle de plafond à la souscription, écrans
   * admin, exports.
   *
   * Il y était recopié par un `profilPP.categoriePsfp = …` suivi de deux
   * affectations en `as any`, sur l'entité ORM chargée depuis le use case ;
   * puis, un temps, par trois champs recomposés ici. C'est désormais la racine
   * qui dit ce qu'elle impose — voir `InvestorComplianceProfile.classement` —
   * et ce use case ne fait plus que le porter jusqu'au port.
   */
  private async reporterSurLeProfil(
    userId: number,
    profil: InvestorComplianceProfile,
  ): Promise<void> {
    const classement = profil.classement;
    if (classement === null) return;

    await this.profilPPRepository.enregistrerClassementPsfp(userId, classement);
  }
}
