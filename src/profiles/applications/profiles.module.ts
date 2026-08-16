import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesInfrastructureModule } from '../infrastructure/profiles-infrastructure.module';
import { CreateProfilPPUseCase } from './usecases/create-profil-pp.usecase';
import { CreateKycUseCase } from './usecases/create-kyc.usecase';
import { UpdateKycStatusUseCase } from './usecases/update-kyc-status.usecase';
import { ProfileController } from '../presenters/http/profile.controller';
import { GetProfilPPUseCase } from './usecases/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from './usecases/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from './usecases/create-profil-pm.usecase';
import { GetProfilPMUseCase } from './usecases/get-profil-pm.usecase';
import { UpdateProfilPMUseCase } from './usecases/update-profil-pm.usecase';
import { GetKycUseCase } from './usecases/get-kyc.usecase';
import { SaveQuestionnaireUseCase } from './usecases/save-questionnaire.usecase';
import { QuestionnaireAdequationEntity } from '../infrastructure/persistences/entities/questionnaire-adequation.entity';
import { ProfilPPEntity } from '../infrastructure/persistences/entities/profil-pp.entity';
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
    ProfilesInfrastructureModule,
    IamInfrastructureModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      QuestionnaireAdequationEntity,
      ProfilPPEntity,
      UserEntity,
      BeneficiaireEffectifEntity,
      ProfilPMEntity,
    ]),
  ],
  providers: [
    CreateProfilPPUseCase,
    CreateKycUseCase,
    UpdateKycStatusUseCase,
    GetProfilPPUseCase,
    UpdateProfilPPUseCase,
    CreateProfilPMUseCase,
    GetProfilPMUseCase,
    UpdateProfilPMUseCase,
    GetKycUseCase,
    SaveQuestionnaireUseCase,
    RiskScoringService,
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
