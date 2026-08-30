import { Injectable } from '@nestjs/common';
import type {
  AvancementDuQuestionnaire,
  AvancementDuQuestionnaireQuery,
} from 'src/adequacy/application/ports/avancement-du-questionnaire.query';
import { EvaluationDAdequationTypeOrmRepository } from './evaluation-d-adequation.repository';

/**
 * L'avancement, lu par la racine.
 *
 * Comme le classement, il est **calculé** et non stocké : quelle étape vient
 * dépend des seuils réglementaires que les réponses ont franchis, et un
 * professionnel voit son parcours clos dès la première. Le déduire en SQL
 * dupliquerait cette règle hors du domaine.
 */
@Injectable()
export class AvancementDuQuestionnaireTypeOrmQuery implements AvancementDuQuestionnaireQuery {
  constructor(
    private readonly evaluations: EvaluationDAdequationTypeOrmRepository,
  ) {}

  async duTitulaire(investorId: number): Promise<AvancementDuQuestionnaire> {
    const evaluation = await this.evaluations.parTitulaire(investorId);
    return {
      classement: evaluation.classement.toSnapshot(),
      etapeSuivante: evaluation.etapeSuivanteDuQuestionnaire(),
      etapesRepondues: evaluation.etapesReponduesDuQuestionnaire(),
    };
  }
}
