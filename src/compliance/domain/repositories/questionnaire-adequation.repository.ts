import { AdequacyAssessment } from 'src/compliance/domain/entities/adequacy-assessment';

export const QUESTIONNAIRE_ADEQUATION_REPOSITORY = Symbol(
  'QUESTIONNAIRE_ADEQUATION_REPOSITORY',
);

/**
 * Accès en persistance au questionnaire d'adéquation.
 *
 * Il n'y avait pas de port du tout : `SaveQuestionnaireUseCase`,
 * `RiskScoringService` et même `ProfileController` injectaient directement le
 * `Repository<QuestionnaireAdequationEntity>` de TypeORM. La couche applicative
 * dépendait donc d'une techno concrète (§12.3), et la présentation parlait à
 * l'infrastructure sans passer par personne (§12.9) — trois endroits à rouvrir
 * le jour d'un changement de stockage, et un domaine intestable sans base.
 *
 * Deux méthodes, pas plus : c'est tout ce que le contexte fait de ce
 * questionnaire (§4 — ISP).
 */
export interface QuestionnaireAdequationRepository {
  /** `null` tant que le titulaire n'a jamais répondu. */
  findByUserId(userId: number): Promise<AdequacyAssessment | null>;

  /**
   * Crée ou remplace le questionnaire du compte. `utilisateurId` porte un index
   * unique : un titulaire n'a qu'un questionnaire, celui de son dernier
   * passage.
   */
  save(
    questionnaire: AdequacyAssessment,
  ): Promise<AdequacyAssessment>;
}
