import { Inject, Injectable } from '@nestjs/common';
import {
  QUESTIONNAIRE_ADEQUATION_REPOSITORY,
  type QuestionnaireAdequationRepository,
} from 'src/iam/domain/repositories/questionnaire-adequation.repository';
import { QuestionnaireAdequation } from 'src/iam/domain/aggregates/questionnaire-adequation';

/**
 * Lecture du questionnaire d'adéquation du titulaire.
 *
 * Le contrôleur appelait `questionnaireRepo.findOne()` sur le repository
 * TypeORM qu'il s'était fait injecter : la présentation parlait directement à
 * l'infrastructure (§12.9), et l'entité ORM sortait telle quelle dans la
 * réponse HTTP.
 *
 * **Rend `null` plutôt que de lever** quand le titulaire n'a jamais répondu :
 * c'est le comportement d'origine, et il a du sens ici — le front interroge
 * cette route pour savoir s'il doit proposer le formulaire, et une absence de
 * réponse n'est pas une erreur.
 */
@Injectable()
export class GetQuestionnaireUseCase {
  constructor(
    @Inject(QUESTIONNAIRE_ADEQUATION_REPOSITORY)
    private readonly questionnaireRepository: QuestionnaireAdequationRepository,
  ) {}

  execute(userId: number): Promise<QuestionnaireAdequation | null> {
    return this.questionnaireRepository.findByUserId(userId);
  }
}
