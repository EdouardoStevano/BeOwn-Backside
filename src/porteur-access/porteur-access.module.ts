import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import {
  DemandeAccesPorteurReader,
  DemandeAccesPorteurWriter,
} from './applications/ports/demande-acces-porteur.repository';
import { SoumettreDemandePorteurUseCase } from './applications/usecases/soumettre-demande-porteur.usecase';
import { InstruireDemandePorteurUseCase } from './applications/usecases/instruire-demande-porteur.usecase';
import { DeciderDemandePorteurUseCase } from './applications/usecases/decider-demande-porteur.usecase';
import { RetirerDemandePorteurUseCase } from './applications/usecases/retirer-demande-porteur.usecase';
import { StatuerAccesPorteurUseCase } from './applications/usecases/statuer-acces-porteur.usecase';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { DemandeAccesPorteurEntity } from './infrastructure/persistences/entities/demande-acces-porteur.entity';
import { TypeOrmDemandeAccesPorteurRepository } from './infrastructure/persistences/repositories/typeorm-demande-acces-porteur.repository';
import { PorteurAccessController } from './presenters/http/porteur-access.controller';
import { AdminPorteurAccessController } from './presenters/http/admin-porteur-access.controller';

/**
 * Demande d'accès porteur — lot 4, décision fondateur D1.
 *
 * Le câblage est le seul endroit qui connaisse à la fois le port et son
 * adaptateur : un adaptateur unique branché derrière DEUX contrats séparés
 * (`useExisting`), de sorte qu'un consommateur de lecture ne puisse pas
 * écrire. Changer de persistance ne touche que ces trois lignes.
 *
 * `UsersInfrastructureModule` fournit `USER_REPOSITORY` (lecture du couple
 * rôle/porteurAccess et écriture du drapeau) ; `IamInfrastructureModule`
 * fournit `SessionCacheService` (révocation de la session de la cible à
 * l'octroi) ; `NotificationsModule` fournit notifications et journal d'audit.
 */
@Module({
  imports: [
    // `UserEntity` : lecture du STATUT des comptes demandeurs pour la file
    // d'instruction (une requête par page, jamais une par ligne).
    TypeOrmModule.forFeature([DemandeAccesPorteurEntity, UserEntity]),
    UsersInfrastructureModule,
    IamInfrastructureModule,
    NotificationsModule,
  ],
  controllers: [PorteurAccessController, AdminPorteurAccessController],
  providers: [
    TypeOrmDemandeAccesPorteurRepository,
    {
      provide: DemandeAccesPorteurReader,
      useExisting: TypeOrmDemandeAccesPorteurRepository,
    },
    {
      provide: DemandeAccesPorteurWriter,
      useExisting: TypeOrmDemandeAccesPorteurRepository,
    },
    SoumettreDemandePorteurUseCase,
    InstruireDemandePorteurUseCase,
    DeciderDemandePorteurUseCase,
    RetirerDemandePorteurUseCase,
    StatuerAccesPorteurUseCase,
  ],
})
export class PorteurAccessModule {}
