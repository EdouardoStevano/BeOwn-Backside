import { Module } from '@nestjs/common';
import { ProjectsInfrastructureModule } from '../infrastructure/projects-infrastructure.module';
import { InvestmentsInfrastructureModule } from 'src/investments/infrastructure/investments-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { AvisInfrastructureModule } from 'src/avis/infrastructure/avis-infrastructure.module';
import { CreateProjectUseCase } from './usecases/create-project.usecase';
import { UpdateProjectStatusUseCase } from './usecases/update-project-status.usecase';
import { GetProjectsUseCase } from './usecases/get-projects.usecase';
import { ProjectController } from '../presenters/http/project.controller';

@Module({
  imports: [
    ProjectsInfrastructureModule,
    InvestmentsInfrastructureModule,
    DocumentsInfrastructureModule,
    AvisInfrastructureModule,
  ],
  providers: [
    CreateProjectUseCase,
    UpdateProjectStatusUseCase,
    GetProjectsUseCase,
  ],
  controllers: [ProjectController],
  exports: [GetProjectsUseCase],
})
export class ProjectsModule {}
