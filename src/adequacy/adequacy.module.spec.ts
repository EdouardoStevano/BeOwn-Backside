import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TokenService } from 'src/iam/application/services/token/token.service';
import { DOSSIER_ENTREE_EN_RELATION_REPOSITORY } from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';
import { QuestionnaireController } from './presentation/http/questionnaire.controller';
import { SaveQuestionnaireUseCase } from './application/usecases/profiles/save-questionnaire.usecase';
import { RepondreEtapeQuestionnaireUseCase } from './application/usecases/profiles/repondre-etape-questionnaire.usecase';
import { GetQuestionnaireUseCase } from './application/usecases/profiles/get-questionnaire.usecase';
import { RiskScoringService } from './application/services/risk-scoring.service';
import { EVALUATION_ADEQUATION_REPOSITORY } from './domain/repositories/evaluation-d-adequation.repository';
import { CLASSEMENT_DU_TITULAIRE_QUERY } from './application/ports/classement-du-titulaire.query';
import { SUIVI_DES_INVESTISSEURS_QUERY } from './application/ports/suivi-des-investisseurs.query';
import { AVANCEMENT_DU_QUESTIONNAIRE_QUERY } from './application/ports/avancement-du-questionnaire.query';
import { EvaluationDAdequationTypeOrmRepository } from './infrastructure/repositories/evaluation-d-adequation.repository';
import { ClassementDuTitulaireTypeOrmQuery } from './infrastructure/repositories/classement-du-titulaire.query';
import { SuiviDesInvestisseursTypeOrmQuery } from './infrastructure/repositories/suivi-des-investisseurs.query';
import { AvancementDuQuestionnaireTypeOrmQuery } from './infrastructure/repositories/avancement-du-questionnaire.query';
import { EvaluationAdequationEntity } from './infrastructure/persistence/entities/evaluation-adequation.entity';
import { QuestionnaireAdequationEntity } from './infrastructure/persistence/entities/questionnaire-adequation.entity';

/**
 * Le câblage du contexte tient-il debout ?
 *
 * Un `tsc` propre ne dit rien de la résolution des dépendances : un port
 * déclaré mais non fourni ne se voit qu'au démarrage. Ce contexte vient d'être
 * détaché de la conformité, avec trois ports neufs et un contrôleur qui n'a
 * jamais démarré — le vérifier ici vaut mieux que de le découvrir au premier
 * `GET /profiles/questionnaire/me`.
 *
 * Le montage reprend **les providers des deux modules du contexte**, sans leurs
 * imports : monter les modules réels tirerait l'infrastructure d'IAM et
 * TypeORM, et ce test parlerait alors de leur câblage plutôt que du nôtre. Les
 * frontières — les deux tables, le service de jetons — sont fournies en
 * doublure.
 */
describe('AdequacyModule — câblage', () => {
  const monter = () =>
    Test.createTestingModule({
      controllers: [QuestionnaireController],
      providers: [
        SaveQuestionnaireUseCase,
        RepondreEtapeQuestionnaireUseCase,
        GetQuestionnaireUseCase,
        RiskScoringService,
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
        // Les frontières, en doublure.
        {
          provide: getRepositoryToken(EvaluationAdequationEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(QuestionnaireAdequationEntity),
          useValue: {},
        },
        // Les gardes montées par le contrôleur sont résolues à la compilation
        // du module : leurs dépendances viennent d'IAM et de l'entrée en
        // relation.
        { provide: TokenService, useValue: {} },
        { provide: DOSSIER_ENTREE_EN_RELATION_REPOSITORY, useValue: {} },
      ],
    }).compile();

  it('résout le contrôleur, les trois use cases et les trois ports de lecture', async () => {
    const module = await monter();

    expect(module.get(QuestionnaireController)).toBeDefined();

    expect(module.get(SaveQuestionnaireUseCase)).toBeDefined();
    expect(module.get(RepondreEtapeQuestionnaireUseCase)).toBeDefined();
    expect(module.get(GetQuestionnaireUseCase)).toBeDefined();
    expect(module.get(RiskScoringService)).toBeDefined();

    expect(module.get(CLASSEMENT_DU_TITULAIRE_QUERY)).toBeInstanceOf(
      ClassementDuTitulaireTypeOrmQuery,
    );
    expect(module.get(SUIVI_DES_INVESTISSEURS_QUERY)).toBeInstanceOf(
      SuiviDesInvestisseursTypeOrmQuery,
    );
    expect(module.get(AVANCEMENT_DU_QUESTIONNAIRE_QUERY)).toBeInstanceOf(
      AvancementDuQuestionnaireTypeOrmQuery,
    );

    await module.close();
  });
});
