import { Module } from '@nestjs/common';
import { ProjectsInfrastructureModule } from '../infrastructures/projects-infrastructure.module';
import { CreateProjectUseCase } from './usecases/create-project.usecase';
import { UpdateProjectStatusUseCase } from './usecases/update-project-status.usecase';
import { GetProjectsUseCase } from './usecases/get-projects.usecase';
import { ProjectController } from '../presenters/http/project.controller';
import { PROJECT_REPOSITORY } from './ports/repositories/project.repository';

@Module({
  imports: [ProjectsInfrastructureModule],
  providers: [
    CreateProjectUseCase,
    UpdateProjectStatusUseCase,
    GetProjectsUseCase,
  ],
  controllers: [ProjectController],
  exports: [GetProjectsUseCase],
})
export class ProjectsModule {}
