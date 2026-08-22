import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecondaryMarketInfrastructureModule } from './infrastructure/secondary-market-infrastructure.module';
import { SecondaryMarketController } from './presentation/http/secondary-market.controller';
import { AdminSecondaryMarketController } from './presentation/http/admin-secondary-market.controller';
import { AnnulerOrdreParAdministrationUseCase } from './application/usecases/annuler-ordre-par-administration.usecase';
import { ForcerExecutionOrdreUseCase } from './application/usecases/forcer-execution-ordre.usecase';
import { PlatformFeesModule } from 'src/common/platform-fees/platform-fees.module';
import { YouSignWebhookController } from './presentation/http/yousign-webhook.controller';
import { SecondaryMarketErrorFilter } from './presentation/http/filters/secondary-market-error.filter';
import { PasserOrdreDeVenteUseCase } from './application/usecases/passer-ordre-de-vente.usecase';
import { ExecuterOrdreUseCase } from './application/usecases/executer-ordre.usecase';
import { AnnulerOrdreUseCase } from './application/usecases/annuler-ordre.usecase';
import { InitiateBuyUseCase } from './application/usecases/initiate-buy.usecase';
import { CancelInitiationUseCase } from './application/usecases/cancel-initiation.usecase';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { YouSignModule } from 'src/common/yousign/yousign.module';
import { ContractGeneratorService } from 'src/subscription/application/services/contract-generator.service';
import { KycModule } from 'src/compliance/application/kyc.module';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { UsersModule } from 'src/iam/application/users.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';

/**
 * Bounded Context **Secondary Market** (§3.2, M9) : la liquidité — un porteur
 * met tout ou partie de ses fractions au carnet, un autre investisseur les
 * reprend, et le registre des porteurs se met à jour.
 *
 * **Il vivait sous un nom et des couches qui n'étaient pas les siens.** Le
 * dossier s'appelait `secondarymarket/` là où §3.2 nomme le contexte
 * `secondary-market`, et ses couches `domains/`, `applications/`, `presenters/`
 * là où §5 fixe `domain/`, `application/`, `presentation/`. Ce n'est pas
 * cosmétique : quatre contextes voisins (`subscription`, `treasury`,
 * `servicing`, `compliance`) portent la structure de §5, et une couche qui
 * change de nom d'un contexte à l'autre est une couche qu'on cesse de
 * reconnaître.
 *
 * Position dans la Context Map (§3.4) :
 *
 * - **aval** de `compliance` : céder et acquérir exigent un dossier vérifié —
 *   `KycValidatedGuard` garde les trois routes mutantes ;
 * - **amont** de `subscription` et de `servicing` : une cession transfère des
 *   fractions d'un investissement à un autre, et l'échéancier suit le nouveau
 *   porteur. Le fait `BondTransferred` est le contrat prévu ; aujourd'hui la
 *   cession écrit elle-même dans les deux contextes, au sein de sa transaction ;
 * - **amont** de `treasury` : le règlement débite l'acheteur et crédite le
 *   vendeur ;
 * - **Anti-Corruption Layer** vers YouSign, dont le webhook entre par
 *   `YouSignWebhookController`.
 *
 * Le contexte a son modèle : `SecondaryMarketOrder` est l'agrégat racine (§6),
 * propriétaire du cycle de vie d'une annonce, et `CapaciteDeCession` porte
 * l'invariant d'anti-double-mise-en-vente — celui qui empêche un porteur de
 * dix fractions d'en offrir vingt. Il a ses erreurs (`SecondaryMarketError`)
 * et leur filtre, son mapper, et trois use cases là où le contrôleur écrivait
 * ses transactions lui-même.
 *
 * Écarts temporaires, assumés et à résorber (§3.3) :
 *
 * - les use cases manipulent directement les entités ORM et l'`EntityManager`,
 *   y compris celles de `subscription` (positions) et de `treasury` (wallets,
 *   ledger) : le règlement d'une cession est une transaction unique faute
 *   d'unité de travail partagée entre contextes — la résorber demande un port
 *   de transaction, pas un remodelage du domaine ;
 * - le décrément de la position vendeuse retranche le prix de vente et non le
 *   coût d'acquisition, dérive que `computeCoutAcquisition` documente déjà et
 *   que seul un historique d'acquisition par lot corrigerait ;
 * - `YouSignWebhookController` traite aussi les signatures de **souscription
 *   primaire**, qui appartiennent à `subscription` : un webhook partagé, monté
 *   ici pour des raisons d'historique et non de domaine ;
 * - `MATCH_PROPOSE`, `ACCEPTE` et `EXPIRE` restent des statuts qu'aucun code
 *   ne pose : l'appariement négocié n'a jamais été implémenté, et l'expiration
 *   attend un CRON qui lirait `valideJusquAu`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, UserEntity, InvestmentEntity]),
    SecondaryMarketInfrastructureModule,
    IamInfrastructureModule,
    NotificationsModule,
    CloudStorageModule,
    YouSignModule,
    UsersModule,
    UsersInfrastructureModule,
    // `KycValidatedGuard` : acheter au marché secondaire exige un dossier vérifié.
    KycModule,
    // Les frais de revente, lus une fois avant chaque règlement.
    PlatformFeesModule,
  ],
  providers: [
    ContractGeneratorService,
    PasserOrdreDeVenteUseCase,
    ExecuterOrdreUseCase,
    AnnulerOrdreUseCase,
    AnnulerOrdreParAdministrationUseCase,
    ForcerExecutionOrdreUseCase,
    InitiateBuyUseCase,
    CancelInitiationUseCase,
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§21), la présentation s'en charge.
    { provide: APP_FILTER, useClass: SecondaryMarketErrorFilter },
  ],
  controllers: [
    SecondaryMarketController,
    AdminSecondaryMarketController,
    YouSignWebhookController,
  ],
})
export class SecondaryMarketModule {}
