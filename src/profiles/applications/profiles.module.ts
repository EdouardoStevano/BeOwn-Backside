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
import { ProfileController } from '../presenters/http/profile.controller';
import { GetProfilPPUseCase } from './usecases/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from './usecases/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from './usecases/create-profil-pm.usecase';
import { GetProfilPMUseCase } from './usecases/get-profil-pm.usecase';
import { UpdateProfilPMUseCase } from './usecases/update-profil-pm.usecase';
import { GetKycUseCase } from './usecases/get-kyc.usecase';
import { SaveQuestionnaireUseCase } from './usecases/save-questionnaire.usecase';
import { GetQuestionnaireUseCase } from './usecases/get-questionnaire.usecase';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
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
    IamInfrastructureModule,
    NotificationsModule,
    // Ce qui reste ici est ce que la présentation lit encore en direct : le
    // compte (contrôle de rôle) et les bénéficiaires effectifs. Le
    // questionnaire et le profil PP en sont sortis — ils passent désormais par
    // leurs ports (§12.3, §12.9).
    TypeOrmModule.forFeature([
      UserEntity,
      BeneficiaireEffectifEntity,
      ProfilPMEntity,
    ]),
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
    RiskScoringService,
    KycRevueManuelleDemandeeEventHandler,
    KycValideEventHandler,
    KycRefuseEventHandler,
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§12.1), la présentation s'en charge.
    { provide: APP_FILTER, useClass: ProfilesErrorFilter },
  ],
  controllers: [ProfileController, BeneficiaireEffectifController],
  exports: [
    CreateKycUseCase,
    UpdateKycStatusUseCase,
    ProfilesInfrastructureModule,
    RiskScoringService,
  ],
})
export class ProfilesModule {}
