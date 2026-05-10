import { Module } from '@nestjs/common';
import { ProfilesInfrastructureModule } from '../infrastructure/profiles-infrastructure.module';
import { CreateProfilPPUseCase } from './usecases/create-profil-pp.usecase';
import { CreateKycUseCase } from './usecases/create-kyc.usecase';
import { UpdateKycStatusUseCase } from './usecases/update-kyc-status.usecase';
import { ProfileController } from '../presenters/http/profile.controller';
import { GetProfilPPUseCase } from './usecases/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from './usecases/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from './usecases/create-profil-pm.usecase';
import { GetKycUseCase } from './usecases/get-kyc.usecase';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

@Module({
  imports: [ProfilesInfrastructureModule, IamInfrastructureModule],
  providers: [
    CreateProfilPPUseCase,
    CreateKycUseCase,
    UpdateKycStatusUseCase,
    GetProfilPPUseCase,
    UpdateProfilPPUseCase,
    CreateProfilPMUseCase,
    GetKycUseCase,
  ],
  controllers: [ProfileController],
  exports: [CreateKycUseCase, UpdateKycStatusUseCase, ProfilesInfrastructureModule],
})
export class ProfilesModule {}
