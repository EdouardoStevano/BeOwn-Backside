import { Module } from '@nestjs/common';
import { LocativeManagementInfrastructureModule } from '../infrastructure/locative-management-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { CloudStorageModule } from 'src/common/cloud-storage/cloud-storage.module';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructure/projects-infrastructure.module';
import { AddUniteLouableUseCase } from './usecases/add-unite-louable.usecase';
import { CreateBailUseCase } from './usecases/create-bail.usecase';
import { UpdateBailUseCase } from './usecases/update-bail.usecase';
import { ResilierBailUseCase } from './usecases/resilier-bail.usecase';
import { DeclareLoyerEncaisseUseCase } from './usecases/declare-loyer-encaisse.usecase';
import { DeclareChargeUseCase } from './usecases/declare-charge.usecase';
import { GetProjectOccupationUseCase } from './usecases/get-project-occupation.usecase';
import { GetProjectEtatFinancierUseCase } from './usecases/get-project-etat-financier.usecase';
import { ValidateLoyerEncaisseUseCase } from './usecases/validate-loyer-encaisse.usecase';
import { ValidateChargeUseCase } from './usecases/validate-charge.usecase';
import { PorteurController } from '../presenters/http/porteur.controller';
import { AdminLocativeController } from '../presenters/http/admin-locative.controller';

@Module({
  imports: [
    LocativeManagementInfrastructureModule,
    NotificationsModule,
    CloudStorageModule,
    ProjectsInfrastructureModule,
  ],
  controllers: [PorteurController, AdminLocativeController],
  providers: [
    AddUniteLouableUseCase,
    CreateBailUseCase,
    UpdateBailUseCase,
    ResilierBailUseCase,
    DeclareLoyerEncaisseUseCase,
    DeclareChargeUseCase,
    GetProjectOccupationUseCase,
    GetProjectEtatFinancierUseCase,
    ValidateLoyerEncaisseUseCase,
    ValidateChargeUseCase,
  ],
  exports: [
    LocativeManagementInfrastructureModule,
    AddUniteLouableUseCase,
    CreateBailUseCase,
    UpdateBailUseCase,
    ResilierBailUseCase,
    DeclareLoyerEncaisseUseCase,
    DeclareChargeUseCase,
    GetProjectOccupationUseCase,
    GetProjectEtatFinancierUseCase,
    ValidateLoyerEncaisseUseCase,
    ValidateChargeUseCase,
  ],
})
export class LocativeManagementModule {}
