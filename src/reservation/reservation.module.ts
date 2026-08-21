import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogInfrastructureModule } from 'src/catalog/infrastructure/catalog-infrastructure.module';
import { KycModule } from 'src/compliance/application/kyc.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import {
  FifoRankingPolicy,
  RESERVATION_RANKING_POLICY,
} from './domain/policies/reservation-ranking.policy';
import { ReservationInfrastructureModule } from './infrastructure/reservation-infrastructure.module';
import { CancelReservationUseCase } from './application/usecases/cancel-reservation.usecase';
import { CreateReservationUseCase } from './application/usecases/create-reservation.usecase';
import {
  ListProjectReservationsUseCase,
  ListUserReservationsUseCase,
} from './application/usecases/list-reservations.usecase';
import { ReservationErrorFilter } from './presentation/http/filters/reservation-error.filter';
import { ReservationController } from './presentation/http/reservation.controller';

/**
 * Bounded Context **Reservation** (§3.2, M5) — le **Core Domain** (§1, §3.1) :
 * verrouiller un engagement financier sur un projet ANNONCÉ mais pas encore
 * PUBLIÉ, avec rang de conversion prioritaire à l'ouverture de la collecte.
 * C'est le différenciateur du produit (§1.2 du cahier des charges) : le seuil
 * de rigueur le plus élevé s'applique ici.
 *
 * Position dans la Context Map (§3.4) :
 *
 * - **en aval** de `catalog` (statut du projet, cible — lu via
 *   `PROJECT_REPOSITORY`, traduit par `ProjetReservableTranslator`) et de
 *   `compliance` (éligibilité — `KycValidatedGuard` devant la route) ;
 * - **en amont** de `subscription` : le fait `ReservationConvertie` est son
 *   contrat (Published Language) — `subscription` ne connaît jamais
 *   l'agrégat `Reservation`.
 *
 * La politique de rang est liée ici (§22) : FIFO par défaut, remplaçable le
 * jour où le critère de score de §7.3.3 est clarifié avec le client.
 */
@Module({
  imports: [
    CqrsModule,
    ReservationInfrastructureModule,
    // Amont catalog : la fiche projet dont la file a besoin (Customer/Supplier).
    CatalogInfrastructureModule,
    // `TokenService` pour le JwtAuthGuard monté par le contrôleur.
    IamInfrastructureModule,
    // `KycValidatedGuard` : réserver exige un dossier vérifié (RG-RES-03).
    KycModule,
  ],
  providers: [
    CreateReservationUseCase,
    CancelReservationUseCase,
    ListUserReservationsUseCase,
    ListProjectReservationsUseCase,
    { provide: RESERVATION_RANKING_POLICY, useClass: FifoRankingPolicy },
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§21), la présentation s'en charge.
    { provide: APP_FILTER, useClass: ReservationErrorFilter },
  ],
  controllers: [ReservationController],
  exports: [CreateReservationUseCase],
})
export class ReservationModule {}
