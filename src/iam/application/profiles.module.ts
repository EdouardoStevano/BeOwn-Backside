import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesInfrastructureModule } from '../infrastructure/profiles-infrastructure.module';
import { CreateProfilPPUseCase } from './usecases/profiles/create-profil-pp.usecase';
import { TelephoneDeclareEventHandler } from './handlers/telephone-declare.event-handler';
import { ProfileController } from '../presentation/http/profile.controller';
import { GetProfilPPUseCase } from './usecases/profiles/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from './usecases/profiles/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from './usecases/profiles/create-profil-pm.usecase';
import { GetProfilPMUseCase } from './usecases/profiles/get-profil-pm.usecase';
import { UpdateProfilPMUseCase } from './usecases/profiles/update-profil-pm.usecase';
import { SaveQuestionnaireUseCase } from './usecases/profiles/save-questionnaire.usecase';
import { GetQuestionnaireUseCase } from './usecases/profiles/get-questionnaire.usecase';
import { GetOnboardingStatusUseCase } from './usecases/profiles/get-onboarding-status.usecase';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { KycInfrastructureModule } from 'src/kyc/infrastructure/kyc-infrastructure.module';
import { AccountContactModule } from 'src/iam/application/account-contact.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { RiskScoringService } from './services/risk-scoring.service';
import { BeneficiaireEffectifEntity } from '../infrastructure/persistence/entities/beneficiaire-effectif.entity';
import { ProfilPMEntity } from '../infrastructure/persistence/entities/profil-pm.entity';
import { BeneficiaireEffectifController } from '../presentation/http/beneficiaire-effectif.controller';

/**
 * Dossier de l'investisseur : profil personne physique, profil personne
 * morale, questionnaire d'adéquation.
 *
 * Feature d'IAM depuis le repli de `src/profiles/`. Ce que le dossier décrit —
 * qui est le titulaire, où il vit, ce qu'il déclare de sa situation — prolonge
 * l'identité que le compte ouvre : les deux se lisent ensemble à chaque écran
 * d'entrée en relation, et `profil_pp` a longtemps porté le numéro de
 * téléphone qui appartenait au compte (voir `AccountContactModule`).
 *
 * ⚠️ Écart assumé avec `claude.md`. §3.2 range ces trois agrégats dans
 * `compliance`, avec KYC (M2 + M3 fusionnés), et §3.3 explique pourquoi :
 * RG-KYC-13 fait dériver la catégorisation PSFP du questionnaire d'adéquation,
 * ce qui en fait un seul concept — « l'investisseur est-il éligible, et pour
 * quoi ». L'argument tient, et il reste visible dans le code : `QualificationPsfp`,
 * `EvaluationInvestisseur` et `PlafondPsfpService` parlent conformité, pas
 * identité, et ce module importe `KycInfrastructureModule` pour composer
 * l'avancement du parcours.
 *
 * Le repli dans `identity` est donc une décision de l'équipe, prise en
 * connaissance de cet écart, pas une lecture du guide. Si un contexte
 * `compliance` est créé un jour, c'est ce module — moins la partie strictement
 * signalétique — qui devra le rejoindre.
 */
@Module({
  imports: [
    // Bus d'événements du contexte : `TelephoneDeclareEventHandler` s'y abonne
    // au fait métier levé par la complétion du profil (§8).
    CqrsModule,
    ProfilesInfrastructureModule,
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
    // Pour `ChangerTelephoneUseCase` : le numéro déclaré au formulaire de
    // profil appartient au compte, et c'est IAM qui décide comment il s'écrit.
    AccountContactModule,
    NotificationsModule,
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
    UpdateProfilPMUseCase,
    SaveQuestionnaireUseCase,
    GetQuestionnaireUseCase,
    GetOnboardingStatusUseCase,
    RiskScoringService,
    TelephoneDeclareEventHandler,
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
