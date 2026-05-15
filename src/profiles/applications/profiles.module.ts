import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesInfrastructureModule } from '../infrastructure/profiles-infrastructure.module';
import { CreateProfilPPUseCase } from './usecases/create-profil-pp.usecase';
import { CreateKycUseCase } from './usecases/create-kyc.usecase';
import { UpdateKycStatusUseCase } from './usecases/update-kyc-status.usecase';
import { ProfileController } from '../presenters/http/profile.controller';
import { GetProfilPPUseCase } from './usecases/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from './usecases/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from './usecases/create-profil-pm.usecase';
import { GetKycUseCase } from './usecases/get-kyc.usecase';
import { SaveQuestionnaireUseCase } from './usecases/save-questionnaire.usecase';
import { QuestionnaireAdequationEntity } from '../infrastructure/persistences/entities/questionnaire-adequation.entity';
import { ProfilPPEntity } from '../infrastructure/persistences/entities/profil-pp.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { RiskScoringService } from './risk-scoring.service';

@Module({
  imports: [
    ProfilesInfrastructureModule,
    IamInfrastructureModule,
    NotificationsModule,
    TypeOrmModule.forFeature([QuestionnaireAdequationEntity, ProfilPPEntity]),
  ],
  providers: [
    CreateProfilPPUseCase,
    CreateKycUseCase,
    UpdateKycStatusUseCase,
    GetProfilPPUseCase,
    UpdateProfilPPUseCase,
    CreateProfilPMUseCase,
    GetKycUseCase,
    SaveQuestionnaireUseCase,
    RiskScoringService,
  ],
  controllers: [ProfileController],
  exports: [CreateKycUseCase, UpdateKycStatusUseCase, ProfilesInfrastructureModule, RiskScoringService],
})
export class ProfilesModule {}
