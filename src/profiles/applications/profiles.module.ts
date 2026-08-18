import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesInfrastructureModule } from '../infrastructure/profiles-infrastructure.module';
import { CreateProfilPPUseCase } from './usecases/create-profil-pp.usecase';
import { CreateKycUseCase } from './usecases/create-kyc.usecase';
import { UpdateKycStatusUseCase } from './usecases/update-kyc-status.usecase';
import { RequestKycManualReviewUseCase } from './usecases/request-kyc-manual-review.usecase';
import { DecideKycManualReviewUseCase } from './usecases/decide-kyc-manual-review.usecase';
import { KycRevueManuelleDemandeeEventHandler } from './events/kyc-revue-manuelle-demandee.event-handler';
import { KycValideEventHandler } from './events/kyc-valide.event-handler';
import { KycRefuseEventHandler } from './events/kyc-refuse.event-handler';
import { TelephoneDeclareEventHandler } from './events/telephone-declare.event-handler';
import { ProfileController } from '../presenters/http/profile.controller';
import { GetProfilPPUseCase } from './usecases/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from './usecases/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from './usecases/create-profil-pm.usecase';
import { GetProfilPMUseCase } from './usecases/get-profil-pm.usecase';
import { UpdateProfilPMUseCase } from './usecases/update-profil-pm.usecase';
import { GetKycUseCase } from './usecases/get-kyc.usecase';
import { SaveQuestionnaireUseCase } from './usecases/save-questionnaire.usecase';
import { GetQuestionnaireUseCase } from './usecases/get-questionnaire.usecase';
import { GetOnboardingStatusUseCase } from './usecases/get-onboarding-status.usecase';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { AccountContactModule } from 'src/iam/applications/account-contact.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { RiskScoringService } from './risk-scoring.service';
import { BeneficiaireEffectifEntity } from '../infrastructure/persistences/entities/beneficiaire-effectif.entity';
import { ProfilPMEntity } from '../infrastructure/persistences/entities/profil-pm.entity';
import { BeneficiaireEffectifController } from '../presenters/http/beneficiaire-effectif.controller';
import { ProfilesErrorFilter } from '../presenters/http/filters/profiles-error.filter';

@Module({
  imports: [
    // Bus d'événements du contexte : les use cases KYC y publient les faits
    // métier (revue demandée, dossier validé, dossier refusé), les handlers de
    // `applications/events/` s'y abonnent (§8).
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
    CreateKycUseCase,
    UpdateKycStatusUseCase,
    RequestKycManualReviewUseCase,
    DecideKycManualReviewUseCase,
    GetProfilPPUseCase,
    UpdateProfilPPUseCase,
    CreateProfilPMUseCase,
    GetProfilPMUseCase,
    UpdateProfilPMUseCase,
    GetKycUseCase,
    SaveQuestionnaireUseCase,
    GetQuestionnaireUseCase,
    GetOnboardingStatusUseCase,
    RiskScoringService,
    KycRevueManuelleDemandeeEventHandler,
    KycValideEventHandler,
    KycRefuseEventHandler,
    TelephoneDeclareEventHandler,
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§12.1), la présentation s'en charge.
    { provide: APP_FILTER, useClass: ProfilesErrorFilter },
  ],
  controllers: [ProfileController, BeneficiaireEffectifController],
  exports: [
    // Consommé par `UserController` (IAM) : `GET /users/me` compose le compte
    // avec l'avancement du dossier, que seul ce contexte sait calculer.
    GetOnboardingStatusUseCase,
    CreateKycUseCase,
    UpdateKycStatusUseCase,
    ProfilesInfrastructureModule,
    RiskScoringService,
  ],
})
export class ProfilesModule {}
