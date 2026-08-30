import { Inject, Injectable } from '@nestjs/common';
import { AdequacyAssessmentSnapshot } from 'src/adequacy/domain/entities/adequacy-assessment';
import {
  EVALUATION_ADEQUATION_REPOSITORY,
  type EvaluationDAdequationRepository,
} from 'src/adequacy/domain/repositories/evaluation-d-adequation.repository';
import { SaveQuestionnaireDto } from 'src/adequacy/presentation/http/dto/questionnaire.dto';
import { reponsesDepuisDto } from '../../mappers/questionnaire-reponses.mapper';
import { RiskScoringService } from '../../services/risk-scoring.service';

/**
 * Passage du questionnaire d'adéquation PSFP.
 *
 * Ce use case n'orchestre que des accès (§14) : relire l'éligibilité du
 * titulaire, lui donner les nouvelles réponses ou faire naître son
 * questionnaire, persister. Le classement lui-même — trois étapes, trois
 * seuils réglementaires et le calcul du plafond conseillé — vit dans
 * `ResultatAdequation`, où il se teste sans base de données.
 *
 * **Il n'y a plus rien à reporter.** Le classement était recopié sur le profil
 * personne physique, parce que c'est là que `subscription` allait le lire ;
 * cette copie a disparu avec les colonnes qui la portaient. La racine le
 * calcule à la demande depuis le questionnaire, et le sert par
 * `PROFIL_CONFORMITE_QUERY`. Une seule vérité, donc plus de report à tenir
 * synchrone — ni de personne morale laissée sans classement.
 */
@Injectable()
export class SaveQuestionnaireUseCase {
  constructor(
    @Inject(EVALUATION_ADEQUATION_REPOSITORY)
    private readonly profils: EvaluationDAdequationRepository,
    private readonly riskScoringService: RiskScoringService,
  ) {}

  async execute(
    userId: number,
    dto: SaveQuestionnaireDto,
  ): Promise<AdequacyAssessmentSnapshot> {
    const reponses = reponsesDepuisDto(dto);
    const profil = await this.profils.parTitulaire(userId);

    profil.repondreAuQuestionnaire(reponses);

    const enregistre = await this.profils.save(profil);

    await this.riskScoringService.computeAndStore(userId);

    // Le questionnaire tel qu'il se publie, pas l'entité : le contrôleur ne
    // doit pas tenir de quoi appeler `repondre()` hors de la racine.
    return enregistre.questionnairePublie as AdequacyAssessmentSnapshot;
  }
}
