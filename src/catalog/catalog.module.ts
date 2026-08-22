import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { AmlModule } from 'src/common/aml/aml.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { SubscriptionInfrastructureModule } from 'src/subscription/infrastructure/subscription-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { CatalogInfrastructureModule } from './infrastructure/catalog-infrastructure.module';
import { AdminSortiesController } from './presentation/http/admin-sorties.controller';
import { CatalogErrorFilter } from './presentation/http/filters/catalog-error.filter';
import { ProjectController } from './presentation/http/project.controller';
import { AvisController } from './presentation/http/avis.controller';
import {
  CollecteOuverteEventHandler,
  ProjetAnnonceEventHandler,
} from './application/handlers/diffusion-projet.event-handler';
import { ProjetPublieEventHandler } from './application/handlers/projet-publie.event-handler';
import { ProjetReconsulteEventHandler } from './application/handlers/projet-reconsulte.event-handler';
import { ProjetSoumisEventHandler } from './application/handlers/projet-soumis.event-handler';
import { ProjectReadModelService } from './application/services/project-read-model.service';
import { ProjectTimelineCronService } from './application/services/project-timeline-cron.service';
import { ConsultAvisProjetUseCase } from './application/usecases/avis/consult-avis-projet.usecase';
import { ConsultProjectUseCase } from './application/usecases/project/consult-project.usecase';
import { CreateProjectUseCase } from './application/usecases/project/create-project.usecase';
import { GetProjectShareLinkUseCase } from './application/usecases/project/get-project-share-link.usecase';
import { GetProjectsUseCase } from './application/usecases/project/get-projects.usecase';
import { ListProjectsUseCase } from './application/usecases/project/list-projects.usecase';
import { RecordProjectViewUseCase } from './application/usecases/project/record-project-view.usecase';
import { SubmitProjectUseCase } from './application/usecases/project/submit-project.usecase';
import { UpdateProjectStatusUseCase } from './application/usecases/project/update-project-status.usecase';
import { UpdateProjectUseCase } from './application/usecases/project/update-project.usecase';
import { DeclareSortieUseCase } from './application/usecases/sortie/declare-sortie.usecase';
import { ExecuteSortieUseCase } from './application/usecases/sortie/execute-sortie.usecase';
import { ManageSortieUseCase } from './application/usecases/sortie/manage-sortie.usecase';
import { CreateSpvUseCase } from './application/usecases/spv/create-spv.usecase';
import { ListSpvUseCase } from './application/usecases/spv/list-spv.usecase';

/**
 * Bounded Context **Catalog** (§3.2, M4) : le cycle de vie commercial d'un
 * projet immobilier — sa fiche, sa cible de collecte, la société de projet
 * (SPV) qui le porte, et les sorties qui le clôturent.
 *
 * Position dans la Context Map (§3.4) : `catalog` est **en amont** de
 * `reservation` et `subscription`, à qui il fournit le statut du projet et la
 * cible de collecte — les contextes en aval consomment ses faits
 * (`ProjetPublie`, `CollecteOuverte`…) sans jamais réécrire l'agrégat source.
 *
 * Le module ne déclare aucune table : `TypeOrmModule.forFeature` y
 * enregistrait `WalletEntity`, `TransactionEntity`, `ProjectEntity` et
 * `ProjectViewEntity` — les deux premières appartenant au contexte Treasury, et
 * les quatre servant à des use cases et à un contrôleur qui accédaient à la
 * base sans passer par un repository (§12.3, §12.9). Toutes vivent
 * derrière les ports de `CatalogInfrastructureModule`.
 */
@Module({
  imports: [
    // Bus d'événements du contexte : les use cases y publient les faits métier
    // (projet publié, soumis, annoncé, collecte ouverte, projet reconsulté),
    // les handlers de `application/handlers/` s'y abonnent (§8).
    CqrsModule,
    CatalogInfrastructureModule,
    // Read-models : la fiche projet agrège investissements, documents et avis.
    SubscriptionInfrastructureModule,
    DocumentsInfrastructureModule,
    // Annonces, diffusions et journal d'audit.
    NotificationsModule,
    // Surveillance LCB-FT des versements de sortie.
    AmlModule,
    // `TokenService` pour le JwtAuthGuard monté par les contrôleurs.
    IamInfrastructureModule,
  ],
  providers: [
    CreateProjectUseCase,
    SubmitProjectUseCase,
    UpdateProjectUseCase,
    UpdateProjectStatusUseCase,
    GetProjectsUseCase,
    ListProjectsUseCase,
    ConsultProjectUseCase,
    RecordProjectViewUseCase,
    GetProjectShareLinkUseCase,
    CreateSpvUseCase,
    ListSpvUseCase,
    DeclareSortieUseCase,
    ManageSortieUseCase,
    ExecuteSortieUseCase,
    ConsultAvisProjetUseCase,
    ProjectReadModelService,
    ProjectTimelineCronService,
    ProjetPublieEventHandler,
    ProjetSoumisEventHandler,
    ProjetAnnonceEventHandler,
    CollecteOuverteEventHandler,
    ProjetReconsulteEventHandler,
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§12.1), la présentation s'en charge.
    { provide: APP_FILTER, useClass: CatalogErrorFilter },
  ],
  controllers: [ProjectController, AvisController, AdminSortiesController],
  exports: [
    // Distributions et Locative Management composent avec la lecture des projets.
    GetProjectsUseCase,
    DeclareSortieUseCase,
    ExecuteSortieUseCase,
  ],
})
export class CatalogModule {}
