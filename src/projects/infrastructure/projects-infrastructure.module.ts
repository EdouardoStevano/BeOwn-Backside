import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from './persistences/entities/project.entity';
import { SpvEntity } from './persistences/entities/spv.entity';
import { SortieProjetEntity } from './persistences/entities/sortie-projet.entity';
import { ProjectTypeOrmRepository } from './persistences/repositories/project.repository';
import { SortieProjetTypeOrmRepository } from './persistences/repositories/sortie-projet.repository';
import { PROJECT_REPOSITORY } from '../applications/ports/repositories/project.repository';
import { SORTIE_PROJET_REPOSITORY } from '../applications/ports/repositories/sortie-projet.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, SpvEntity, SortieProjetEntity]),
  ],
  providers: [
    { provide: PROJECT_REPOSITORY, useClass: ProjectTypeOrmRepository },
    {
      provide: SORTIE_PROJET_REPOSITORY,
      useClass: SortieProjetTypeOrmRepository,
    },
  ],
  exports: [PROJECT_REPOSITORY, SORTIE_PROJET_REPOSITORY],
})
export class ProjectsInfrastructureModule {}
