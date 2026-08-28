import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesInfrastructureModule } from '../infrastructure/profiles-infrastructure.module';
import { ComplianceInfrastructureModule } from '../infrastructure/compliance-infrastructure.module';
import { CreateProfilPPUseCase } from './usecases/profiles/create-profil-pp.usecase';
import { ProfileController } from '../presentation/http/profile.controller';
import { GetProfilPPUseCase } from './usecases/profiles/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from './usecases/profiles/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from './usecases/profiles/create-profil-pm.usecase';
import { GetProfilPMUseCase } from './usecases/profiles/get-profil-pm.usecase';
import { ListProfilsPMUseCase } from './usecases/profiles/list-profils-pm.usecase';
import { UpdateProfilPMUseCase } from './usecases/profiles/update-profil-pm.usecase';
import { SaveQuestionnaireUseCase } from './usecases/profiles/save-questionnaire.usecase';
import { RepondreEtapeQuestionnaireUseCase } from './usecases/profiles/repondre-etape-questionnaire.usecase';
import { GetQuestionnaireUseCase } from './usecases/profiles/get-questionnaire.usecase';
import { GetOnboardingStatusUseCase } from './usecases/profiles/get-onboarding-status.usecase';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { KycInfrastructureModule } from 'src/compliance/infrastructure/kyc-infrastructure.module';
import { RiskScoringService } from './services/risk-scoring.service';
import { BeneficiaireEffectifEntity } from '../infrastructure/persistence/entities/beneficiaire-effectif.entity';
import { ProfilPMEntity } from '../infrastructure/persistence/entities/profil-pm.entity';
import { BeneficiaireEffectifController } from '../presentation/http/beneficiaire-effectif.controller';

/**
 * Dossier de l'investisseur : profil personne physique, profil personne
 * morale, questionnaire d'adéquation.
 *
 * Feature de `compliance`, aux côtés de `KycModule` — c'est le M3 du cahier
 * des charges, et le M2 est à côté (§3.2). Le module a transité par IAM le
 * temps de deux commits : ce qu'il décrit — qui est le titulaire, où il vit,
 * ce qu'il déclare — ressemble à de l'identité.
 *
 * Ce n'en est pas. Ce que ce dossier établit, c'est l'**éligibilité** : la
 * catégorisation Averti / Non-averti (`QualificationPsfp`), la capacité de
 * perte (`EvaluationInvestisseur`), le plafond réglementaire
 * (`PlafondPsfpService`). L'identité, au sens d'`identity`, s'arrête au compte
 * — prénom, adresse email, mot de passe, facteurs. Ce que le titulaire
 * **déclare** de lui, numéro de téléphone compris, est au dossier.
 *
 * La preuve par la dépendance : ce module importe `KycInfrastructureModule`
 * pour composer l'avancement du parcours d'entrée en relation, et RG-KYC-13
 * fait dériver la catégorisation PSFP du questionnaire. Séparer les deux
 * faisait passer un même concept par une frontière de contexte, dans les deux
 * sens (§3.3).
 *
 * Le nom `Profiles` est celui du dossier d'origine ; il est appelé à devenir
 * celui du modèle unifié, `InvestorComplianceProfile` (§3.2).
 */
@Module({
  imports: [
    // Bus d'événements du contexte : la complétion du dossier annonce un fait
    // métier, sans savoir qui y réagit (§8).
    CqrsModule,
    ProfilesInfrastructureModule,
    // `INVESTOR_COMPLIANCE_PROFILE_REPOSITORY` : le passage du questionnaire
    // s'enregistre par la racine, qui dit ce que le classement impose.
    ComplianceInfrastructureModule,
    // `IamInfrastructureModule` pour `TokenService` (JwtAuthGuard),
    // `UsersInfrastructureModule` pour le seul `USER_REPOSITORY` : le contexte
    // Profiles lit l'identité du compte par le port d'IAM, plus par son entité
    // ORM. Deux modules plutôt qu'un, parce qu'IAM les sépare exprès — les ~20
    // modules qui n'ont besoin que du token ne tirent pas la persistance des
    // comptes avec (CRP, §5).
    IamInfrastructureModule,
    UsersInfrastructureModule,
    // `KYC_REPOSITORY` — pour la seule étape « vérification d'identité » du
    // parcours d'entrée en relation (`GetOnboardingStatusUseCase`). L'infra du
    // contexte KYC, pas son module applicatif : Profiles lit un dossier, il
    // n'ouvre pas de session Stripe et n'écoute aucun de ses événements (§5).
    KycInfrastructureModule,
    // Ce qui reste ici est la seule table que la présentation lit encore en
    // direct : les bénéficiaires effectifs, et le profil moral auquel ils se
    // rattachent. Le questionnaire, le profil PP et le compte en sont sortis —
    // ils passent par leurs ports (§12.3, §12.9).
    TypeOrmModule.forFeature([BeneficiaireEffectifEntity, ProfilPMEntity]),
  ],
  providers: [
    CreateProfilPPUseCase,
    GetProfilPPUseCase,
    UpdateProfilPPUseCase,
    CreateProfilPMUseCase,
    GetProfilPMUseCase,
    ListProfilsPMUseCase,
    UpdateProfilPMUseCase,
    SaveQuestionnaireUseCase,
    RepondreEtapeQuestionnaireUseCase,
    GetQuestionnaireUseCase,
    GetOnboardingStatusUseCase,
    RiskScoringService,
    // Plus de filtre propre : les erreurs du dossier investisseur sont des
    // `IamError` depuis qu'elles ont rejoint le contexte, et `IamErrorFilter`
    // — enregistré globalement par `IamModule` — les traduit avec les mêmes
    // statuts et le même corps que `ProfilesErrorFilter` produisait.
  ],
  controllers: [ProfileController, BeneficiaireEffectifController],
  exports: [
    // Consommé par `UserController` (IAM) : `GET /users/me` compose le compte
    // avec l'avancement du dossier, que seul ce contexte sait calculer.
    GetOnboardingStatusUseCase,
    ProfilesInfrastructureModule,
    RiskScoringService,
  ],
})
export class ProfilesModule {}
