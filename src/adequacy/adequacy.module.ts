import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AdequacyInfrastructureModule } from './infrastructure/adequacy-infrastructure.module';
import { SaveQuestionnaireUseCase } from './application/usecases/profiles/save-questionnaire.usecase';
import { RepondreEtapeQuestionnaireUseCase } from './application/usecases/profiles/repondre-etape-questionnaire.usecase';
import { GetQuestionnaireUseCase } from './application/usecases/profiles/get-questionnaire.usecase';
import { RiskScoringService } from './application/services/risk-scoring.service';
import { QuestionnaireController } from './presentation/http/questionnaire.controller';
import { AdequacyErrorFilter } from './presentation/http/filters/adequacy-error.filter';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

/**
 * **Adéquation & profil de risque** — le questionnaire en trois étapes, la
 * catégorisation Averti / Non-averti, la capacité de perte et la surveillance
 * périodique.
 *
 * **Pourquoi ce contexte existe séparément.** §3.3 du CLAUDE.md fusionnait M2
 * et M3 en un seul `compliance`, au motif que RG-KYC-13 — « la catégorisation
 * PSFP dérive du questionnaire » — créerait sinon une dépendance cyclique entre
 * deux Bounded Contexts. Cette dépendance n'existe plus dans le code : le
 * classement a quitté `ProfilPP` pour `EvaluationDAdequation`, et la dérivation
 * est à sens unique, entièrement contenue dans cette racine. Restaient deux
 * responsabilités qui n'ont ni le même vocabulaire, ni le même rythme, ni le
 * même interlocuteur — l'une répond au RCCI et à la LCB-FT, l'autre à
 * l'obligation d'adéquation du règlement 2020/1503.
 *
 * **L'arête entre les deux est unique et orientée.** L'entrée en relation lit
 * `CLASSEMENT_DU_TITULAIRE_QUERY` pour composer l'éligibilité qu'elle publie aux
 * contextes financiers ; ce contexte-ci ne lit ni KYC, ni KYB, ni pièces
 * justificatives. Adéquation est donc **en amont** (§3.4 — Customer/Supplier),
 * et la seule chose qui franchisse la frontière est un classement publié, jamais
 * un agrégat.
 *
 * Les six routes du questionnaire gardent le préfixe `/profiles` : voir
 * `QuestionnaireController`.
 */
@Module({
  imports: [
    AdequacyInfrastructureModule,
    // `TokenService` pour le `JwtAuthGuard` monté par le contrôleur. L'infra
    // d'IAM seule : ce contexte lit un identifiant de compte dans un jeton, il
    // ne touche jamais à la persistance des comptes (§5).
    IamInfrastructureModule,
  ],
  providers: [
    SaveQuestionnaireUseCase,
    RepondreEtapeQuestionnaireUseCase,
    GetQuestionnaireUseCase,
    // La surveillance périodique (CRON quotidien) et son export admin.
    RiskScoringService,
    // Enregistré globalement, comme ses jumeaux des autres contextes : un
    // filtre porté par le module ne couvrirait pas `AdminInvestorsController`,
    // qui appelle ce contexte depuis le back-office.
    { provide: APP_FILTER, useClass: AdequacyErrorFilter },
  ],
  controllers: [QuestionnaireController],
  exports: [
    // Consommé par `AdminInvestorsController` — la liste des contacts dus.
    RiskScoringService,
    // Réexporté pour l'entrée en relation, qui compose son éligibilité avec le
    // classement publié ici.
    AdequacyInfrastructureModule,
  ],
})
export class AdequacyModule {}
