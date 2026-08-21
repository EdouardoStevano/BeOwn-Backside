import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PROJECT_SHARE_TOKENIZER } from '../applications/ports/project-share-tokenizer.port';
import { PROJECT_VIEW_REPOSITORY } from '../applications/ports/repositories/project-view.repository';
import { PROJECT_REPOSITORY } from '../applications/ports/repositories/project.repository';
import { SORTIE_PROJET_REPOSITORY } from '../applications/ports/repositories/sortie-projet.repository';
import { SPV_REPOSITORY } from '../applications/ports/repositories/spv.repository';
import { SORTIE_SETTLEMENT_PORT } from '../applications/ports/sortie-settlement.port';
import { ProjectViewEntity } from './persistences/entities/project-view.entity';
import { ProjectEntity } from './persistences/entities/project.entity';
import { SortieProjetEntity } from './persistences/entities/sortie-projet.entity';
import { SpvEntity } from './persistences/entities/spv.entity';
import { TypeOrmProjectViewRepository } from './persistences/repositories/typeorm-project-view.repository';
import { TypeOrmProjectRepository } from './persistences/repositories/typeorm-project.repository';
import { TypeOrmSortieProjetRepository } from './persistences/repositories/typeorm-sortie-projet.repository';
import { TypeOrmSpvRepository } from './persistences/repositories/typeorm-spv.repository';
import { TypeOrmSortieSettlementAdapter } from './settlement/typeorm-sortie-settlement.adapter';
import { Sha256ProjectShareTokenizer } from './sharing/sha256-project-share.tokenizer';

/**
 * Adapters de sortie du contexte Projects : les six implémentations de ses
 * ports, et rien d'autre.
 *
 * Le module est importé par les contextes qui lisent des projets — Investments,
 * Reservations, Distributions, Locative Management, Secondary Market — d'où le
 * fait qu'il n'expose que des symboles : un consommateur dépend du port, jamais
 * de la classe TypeORM qui l'implémente (§12.2).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      SpvEntity,
      SortieProjetEntity,
      ProjectViewEntity,
    ]),
  ],
  providers: [
    { provide: PROJECT_REPOSITORY, useClass: TypeOrmProjectRepository },
    { provide: SPV_REPOSITORY, useClass: TypeOrmSpvRepository },
    {
      provide: SORTIE_PROJET_REPOSITORY,
      useClass: TypeOrmSortieProjetRepository,
    },
    {
      provide: PROJECT_VIEW_REPOSITORY,
      useClass: TypeOrmProjectViewRepository,
    },
    { provide: PROJECT_SHARE_TOKENIZER, useClass: Sha256ProjectShareTokenizer },
    {
      provide: SORTIE_SETTLEMENT_PORT,
      useClass: TypeOrmSortieSettlementAdapter,
    },
  ],
  exports: [
    PROJECT_REPOSITORY,
    SPV_REPOSITORY,
    SORTIE_PROJET_REPOSITORY,
    PROJECT_VIEW_REPOSITORY,
    PROJECT_SHARE_TOKENIZER,
    SORTIE_SETTLEMENT_PORT,
  ],
})
export class ProjectsInfrastructureModule {}
