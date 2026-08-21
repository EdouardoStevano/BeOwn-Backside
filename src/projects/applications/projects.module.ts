import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { AvisInfrastructureModule } from 'src/avis/infrastructure/avis-infrastructure.module';
import { AmlModule } from 'src/common/aml/aml.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { InvestmentsInfrastructureModule } from 'src/investments/infrastructure/investments-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ProjectsInfrastructureModule } from '../infrastructure/projects-infrastructure.module';
import { AdminSortiesController } from '../presenters/http/admin-sorties.controller';
import { ProjectsErrorFilter } from '../presenters/http/filters/projects-error.filter';
import { ProjectController } from '../presenters/http/project.controller';
import {
  CollecteOuverteEventHandler,
  ProjetAnnonceEventHandler,
} from './events/diffusion-projet.event-handler';
import { ProjetPublieEventHandler } from './events/projet-publie.event-handler';
import { ProjetReconsulteEventHandler } from './events/projet-reconsulte.event-handler';
import { ProjetSoumisEventHandler } from './events/projet-soumis.event-handler';
import { ProjectReadModelService } from './services/project-read-model.service';
import { ProjectTimelineCronService } from './services/project-timeline-cron.service';
import { ConsultAvisProjetUseCase } from './usecases/avis/consult-avis-projet.usecase';
import { ConsultProjectUseCase } from './usecases/project/consult-project.usecase';
import { CreateProjectUseCase } from './usecases/project/create-project.usecase';
import { GetProjectShareLinkUseCase } from './usecases/project/get-project-share-link.usecase';
import { GetProjectsUseCase } from './usecases/project/get-projects.usecase';
import { ListProjectsUseCase } from './usecases/project/list-projects.usecase';
import { RecordProjectViewUseCase } from './usecases/project/record-project-view.usecase';
import { SubmitProjectUseCase } from './usecases/project/submit-project.usecase';
import { UpdateProjectStatusUseCase } from './usecases/project/update-project-status.usecase';
import { UpdateProjectUseCase } from './usecases/project/update-project.usecase';
import { DeclareSortieUseCase } from './usecases/sortie/declare-sortie.usecase';
import { ExecuteSortieUseCase } from './usecases/sortie/execute-sortie.usecase';
import { ManageSortieUseCase } from './usecases/sortie/manage-sortie.usecase';
import { CreateSpvUseCase } from './usecases/spv/create-spv.usecase';
import { ListSpvUseCase } from './usecases/spv/list-spv.usecase';

/**
 * Bounded Context « projets » : le catalogue des opérations immobilières, leur
 * cycle de vie, les sociétés de projet qui les portent et les sorties qui les
 * clôturent.
 *
 * Le module ne déclare plus aucune table : `TypeOrmModule.forFeature` y
 * enregistrait `WalletEntity`, `TransactionEntity`, `ProjectEntity` et
 * `ProjectViewEntity` — les deux premières appartenant au contexte Wallets, et
 * les quatre servant à des use cases et à un contrôleur qui accédaient à la
 * base sans passer par un repository (§12.3, §12.9). Toutes vivent maintenant
 * derrière les ports de `ProjectsInfrastructureModule`.
 */
@Module({
  imports: [
    // Bus d'événements du contexte : les use cases y publient les faits métier
    // (projet publié, soumis, annoncé, collecte ouverte, projet reconsulté),
    // les handlers de `applications/events/` s'y abonnent (§8).
    CqrsModule,
    ProjectsInfrastructureModule,
    // Read-models : la fiche projet agrège investissements, documents et avis.
    InvestmentsInfrastructureModule,
    DocumentsInfrastructureModule,
    AvisInfrastructureModule,
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
    { provide: APP_FILTER, useClass: ProjectsErrorFilter },
  ],
  controllers: [ProjectController, AdminSortiesController],
  exports: [
    // Distributions et Locative Management composent avec la lecture des projets.
    GetProjectsUseCase,
    DeclareSortieUseCase,
    ExecuteSortieUseCase,
  ],
})
export class ProjectsModule {}
