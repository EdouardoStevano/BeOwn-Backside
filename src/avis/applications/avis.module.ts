import { Module } from '@nestjs/common';
import { AvisInfrastructureModule } from '../infrastructure/avis-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructure/projects-infrastructure.module';
import { AvisController } from '../presenters/http/avis.controller';

@Module({
  imports: [
    AvisInfrastructureModule,
    IamInfrastructureModule,
    // `PROJECT_REPOSITORY` : les deux routes publiques d'avis vérifient que le
    // projet est bien publié avant de servir quoi que ce soit.
    ProjectsInfrastructureModule,
  ],
  controllers: [AvisController],
})
export class AvisModule {}
