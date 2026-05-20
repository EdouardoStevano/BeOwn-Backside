import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsInfrastructureModule } from '../infrastructure/projects-infrastructure.module';
import { InvestmentsInfrastructureModule } from 'src/investments/infrastructure/investments-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { AvisInfrastructureModule } from 'src/avis/infrastructure/avis-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AmlModule } from 'src/common/aml/aml.module';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { CreateProjectUseCase } from './usecases/create-project.usecase';
import { UpdateProjectUseCase } from './usecases/update-project.usecase';
import { UpdateProjectStatusUseCase } from './usecases/update-project-status.usecase';
import { GetProjectsUseCase } from './usecases/get-projects.usecase';
import { DeclareSortieUseCase } from './usecases/declare-sortie.usecase';
import { ExecuteSortieUseCase } from './usecases/execute-sortie.usecase';
import { ProjectController } from '../presenters/http/project.controller';
import { AdminSortiesController } from '../presenters/http/admin-sorties.controller';

@Module({
  imports: [
    ProjectsInfrastructureModule,
    InvestmentsInfrastructureModule,
    DocumentsInfrastructureModule,
    AvisInfrastructureModule,
    NotificationsModule,
    AmlModule,
    TypeOrmModule.forFeature([WalletEntity, TransactionEntity]),
  ],
  providers: [
    CreateProjectUseCase,
    UpdateProjectUseCase,
    UpdateProjectStatusUseCase,
    GetProjectsUseCase,
    DeclareSortieUseCase,
    ExecuteSortieUseCase,
  ],
  controllers: [ProjectController, AdminSortiesController],
  exports: [GetProjectsUseCase, DeclareSortieUseCase, ExecuteSortieUseCase],
})
export class ProjectsModule {}
