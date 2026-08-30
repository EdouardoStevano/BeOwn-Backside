import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EVALUATION_ADEQUATION_REPOSITORY } from '../domain/repositories/evaluation-d-adequation.repository';
import { CLASSEMENT_DU_TITULAIRE_QUERY } from '../application/ports/classement-du-titulaire.query';
import { SUIVI_DES_INVESTISSEURS_QUERY } from '../application/ports/suivi-des-investisseurs.query';
import { AVANCEMENT_DU_QUESTIONNAIRE_QUERY } from '../application/ports/avancement-du-questionnaire.query';
import { EvaluationDAdequationTypeOrmRepository } from './repositories/evaluation-d-adequation.repository';
import { ClassementDuTitulaireTypeOrmQuery } from './repositories/classement-du-titulaire.query';
import { SuiviDesInvestisseursTypeOrmQuery } from './repositories/suivi-des-investisseurs.query';
import { AvancementDuQuestionnaireTypeOrmQuery } from './repositories/avancement-du-questionnaire.query';
import { EvaluationAdequationEntity } from './persistence/entities/evaluation-adequation.entity';
import { QuestionnaireAdequationEntity } from './persistence/entities/questionnaire-adequation.entity';

/**
 * Adapters de sortie du contexte **Adéquation & profil de risque** (§33) : un
 * port par besoin, une implémentation TypeORM pour chacun.
 *
 * **Ses deux tables sont à lui seul.** `evaluation_adequation` porte la racine —
 * classement PSFP et suivi de risque — et `questionnaire_adequation` sa pièce.
 * Aucun autre contexte ne les déclare : c'est ce qui distingue une scission de
 * contextes d'un simple découpage de dossiers. L'entrée en relation lisait
 * encore la première pour composer l'éligibilité ; elle passe désormais par
 * `CLASSEMENT_DU_TITULAIRE_QUERY`, et n'a plus d'entité de l'adéquation dans son
 * `forFeature` (§3, §16).
 *
 * Les trois Query sont séparées du repository et les unes des autres parce
 * qu'elles répondent à quatre questions sans rapport : écrire l'évaluation,
 * publier un classement opposable, raconter un avancement à l'écran, lister une
 * campagne de contact (§40, ISP).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      EvaluationAdequationEntity,
      QuestionnaireAdequationEntity,
    ]),
  ],
  providers: [
    // Exposé aussi par sa classe : les deux Query le composent, et le prendre
    // par son token les obligerait à passer par un `@Inject` pour une
    // dépendance interne au contexte.
    EvaluationDAdequationTypeOrmRepository,
    {
      provide: EVALUATION_ADEQUATION_REPOSITORY,
      useClass: EvaluationDAdequationTypeOrmRepository,
    },
    {
      provide: CLASSEMENT_DU_TITULAIRE_QUERY,
      useClass: ClassementDuTitulaireTypeOrmQuery,
    },
    {
      provide: SUIVI_DES_INVESTISSEURS_QUERY,
      useClass: SuiviDesInvestisseursTypeOrmQuery,
    },
    {
      provide: AVANCEMENT_DU_QUESTIONNAIRE_QUERY,
      useClass: AvancementDuQuestionnaireTypeOrmQuery,
    },
  ],
  exports: [
    EVALUATION_ADEQUATION_REPOSITORY,
    CLASSEMENT_DU_TITULAIRE_QUERY,
    SUIVI_DES_INVESTISSEURS_QUERY,
    AVANCEMENT_DU_QUESTIONNAIRE_QUERY,
  ],
})
export class AdequacyInfrastructureModule {}
