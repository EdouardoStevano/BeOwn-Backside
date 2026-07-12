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
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { RiskScoringService } from './risk-scoring.service';
import { BeneficiaireEffectifEntity } from '../infrastructure/persistences/entities/beneficiaire-effectif.entity';
import { ProfilPMEntity } from '../infrastructure/persistences/entities/profil-pm.entity';
import { BeneficiaireEffectifController } from '../presenters/http/beneficiaire-effectif.controller';

@Module({
  imports: [
    ProfilesInfrastructureModule,
    NotificationsModule,
    TypeOrmModule.forFeature([QuestionnaireAdequationEntity, ProfilPPEntity, UserEntity, BeneficiaireEffectifEntity, ProfilPMEntity]),
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
  controllers: [ProfileController, BeneficiaireEffectifController],
  exports: [CreateKycUseCase, UpdateKycStatusUseCase, ProfilesInfrastructureModule, RiskScoringService],
})
export class ProfilesModule {}
