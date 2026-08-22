import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecondaryMarketInfrastructureModule } from './infrastructure/secondary-market-infrastructure.module';
import { SecondaryMarketController } from './presentation/http/secondary-market.controller';
import { YouSignWebhookController } from './presentation/http/yousign-webhook.controller';
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
 * Ce module donne au contexte son nom et sa forme (§5). Le modèle riche —
 * `SecondaryMarketOrder` en agrégat protégeant son cycle de vie, la capacité
 * de cession portant l'anti-survente, les erreurs de domaine et leur filtre —
 * est l'étape suivante, même découpage en deux temps que `catalog`,
 * `subscription`, `treasury` et `servicing`.
 *
 * Écarts temporaires, assumés et à résorber (§3.3) :
 *
 * - `SecondaryMarketController` porte encore la règle métier — propriété des
 *   fractions, anti-survente du carnet, quantité achetable, règlement,
 *   transfert — en 478 lignes d'`EntityManager` : la logique vit dans un
 *   adaptateur d'entrée, pas dans un agrégat (§14) ;
 * - `YouSignWebhookController` traite aussi les signatures de **souscription
 *   primaire**, qui appartiennent à `subscription` : un webhook partagé, monté
 *   ici pour des raisons d'historique et non de domaine ;
 * - le module enregistre les entités de cinq autres contextes, le règlement
 *   d'une cession étant une transaction unique (voir le module d'infrastructure).
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
  ],
  providers: [
    ContractGeneratorService,
    InitiateBuyUseCase,
    CancelInitiationUseCase,
  ],
  controllers: [SecondaryMarketController, YouSignWebhookController],
})
export class SecondaryMarketModule {}
