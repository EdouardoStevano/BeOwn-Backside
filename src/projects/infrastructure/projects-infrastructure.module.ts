import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from './persistences/entities/project.entity';
import { SpvEntity } from './persistences/entities/spv.entity';
import { ProjectTypeOrmRepository } from './persistences/repositories/project.repository';
import { PROJECT_REPOSITORY } from '../applications/ports/repositories/project.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectEntity, SpvEntity])],
  providers: [
    { provide: PROJECT_REPOSITORY, useClass: ProjectTypeOrmRepository },
  ],
  exports: [PROJECT_REPOSITORY],
})
export class ProjectsInfrastructureModule {}
