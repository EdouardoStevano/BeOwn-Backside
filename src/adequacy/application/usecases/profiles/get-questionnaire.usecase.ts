import { Inject, Injectable } from '@nestjs/common';
import { AdequacyAssessmentSnapshot } from 'src/adequacy/domain/entities/adequacy-assessment';
import {
  EVALUATION_ADEQUATION_REPOSITORY,
  type EvaluationDAdequationRepository,
} from 'src/adequacy/domain/repositories/evaluation-d-adequation.repository';
import {
  VueQuestionnaire,
  vueQuestionnaire,
} from '../../mappers/questionnaire-vue.mapper';

/**
 * Le questionnaire d'adéquation d'un titulaire, `null` s'il n'a pas répondu.
 *
 * Il lisait un `QuestionnaireAdequationRepository` propre à l'entité
 * `AdequacyAssessment` — une pièce interne de la racine, qui n'a pas à avoir
 * son propre port (§6, §10). Il passe par la racine, et publie l'**instantané**
 * plutôt que l'entité : le contrôleur ne doit pas tenir de quoi appeler
 * `repondre()` hors du dossier qui en est propriétaire.
 *
 * La forme du JSON est inchangée — c'est déjà `toJSON()` que la sérialisation
 * appelait.
 */
@Injectable()
export class GetQuestionnaireUseCase {
  constructor(
    @Inject(EVALUATION_ADEQUATION_REPOSITORY)
    private readonly profils: EvaluationDAdequationRepository,
  ) {}

  async execute(userId: number): Promise<AdequacyAssessmentSnapshot | null> {
    const profil = await this.profils.parTitulaire(userId);
    return profil.questionnairePublie;
  }

  /**
   * Le questionnaire **et l'étape à poser** — ce que le parcours en trois temps
   * demande de savoir avant d'afficher quoi que ce soit.
   *
   * Route à part plutôt qu'enrichissement de {@link execute} : celle-ci rend le
   * questionnaire nu depuis toujours, et le front en dépend. L'ajout est donc
   * additif, et `GET /profiles/questionnaire/me` reste mot pour mot ce qu'il
   * était.
   */
  async executeEtapes(userId: number): Promise<VueQuestionnaire> {
    const profil = await this.profils.parTitulaire(userId);
    return vueQuestionnaire(profil);
  }
}
