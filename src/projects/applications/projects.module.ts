import { Module } from '@nestjs/common';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { ConflitsInteretsService } from './conflits-interets.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsInfrastructureModule } from '../infrastructure/projects-infrastructure.module';
import { InvestmentsInfrastructureModule } from 'src/investments/infrastructure/investments-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { AvisInfrastructureModule } from 'src/avis/infrastructure/avis-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AmlModule } from 'src/common/aml/aml.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { ProjectEntity } from '../infrastructure/persistences/entities/project.entity';
import { ProjectViewEntity } from '../infrastructure/persistences/entities/project-view.entity';
import { CreateProjectUseCase } from './usecases/create-project.usecase';
import { UpdateProjectUseCase } from './usecases/update-project.usecase';
import { UpdateProjectStatusUseCase } from './usecases/update-project-status.usecase';
import { GetProjectsUseCase } from './usecases/get-projects.usecase';
import { ProjectReadModelService } from './project-read-model.service';
import { DeclareSortieUseCase } from './usecases/declare-sortie.usecase';
import { ExecuteSortieUseCase } from './usecases/execute-sortie.usecase';
import { ProjectController } from '../presenters/http/project.controller';
import { AdminSortiesController } from '../presenters/http/admin-sorties.controller';
import {
  AdminDocumentClesController,
  DocumentClesController,
} from '../presenters/http/document-cles.controller';
import { EnregistrerDocumentClesUseCase } from './usecases/enregistrer-document-cles.usecase';
import { ConsulterDocumentClesUseCase } from './usecases/consulter-document-cles.usecase';
import { ProjectTimelineCronService } from './project-timeline-cron.service';

@Module({
  imports: [
    ProjectsInfrastructureModule,
    InvestmentsInfrastructureModule,
    DocumentsInfrastructureModule,
    AvisInfrastructureModule,
    NotificationsModule,
    AmlModule,
    IamInfrastructureModule,
    TypeOrmModule.forFeature([
      WalletEntity,
      TransactionEntity,
      ProjectEntity,
      ProjectViewEntity,
      UserEntity,
      ProfilPPEntity,
    ]),
  ],
  providers: [
    CreateProjectUseCase,
    ConflitsInteretsService,
    UpdateProjectUseCase,
    UpdateProjectStatusUseCase,
    GetProjectsUseCase,
    ProjectReadModelService,
    DeclareSortieUseCase,
    ExecuteSortieUseCase,
    EnregistrerDocumentClesUseCase,
    ConsulterDocumentClesUseCase,
    ProjectTimelineCronService,
  ],
  controllers: [
    ProjectController,
    AdminSortiesController,
    DocumentClesController,
    AdminDocumentClesController,
  ],
  exports: [GetProjectsUseCase, DeclareSortieUseCase, ExecuteSortieUseCase],
})
export class ProjectsModule {}
