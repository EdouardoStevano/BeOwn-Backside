import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionInfrastructureModule } from './infrastructure/subscription-infrastructure.module';
import { CatalogInfrastructureModule } from 'src/catalog/infrastructure/catalog-infrastructure.module';
import { TreasuryInfrastructureModule } from 'src/treasury/infrastructure/treasury-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/compliance/infrastructure/profiles-infrastructure.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { YouSignModule } from 'src/documents/infrastructure/external-services/yousign.module';
import { CreateInvestmentUseCase } from './application/usecases/create-investment.usecase';
import { ContractGeneratorService } from './application/services/contract-generator.service';
import { TopUpInvestmentUseCase } from './application/usecases/top-up-investment.usecase';
import { InitiateInvestmentUseCase } from './application/usecases/initiate-investment.usecase';
import { RetractInvestmentUseCase } from './application/usecases/retract-investment.usecase';
import { InvestmentController } from './presentation/http/investment.controller';
import { SubscriptionErrorFilter } from './presentation/http/filters/subscription-error.filter';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistence/entities/document.entity';
import { SignatureEntity } from 'src/documents/infrastructure/persistence/entities/signature.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { KycModule } from 'src/compliance/application/kyc.module';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { CollecteCloseCronService } from './application/services/collecte-close-cron.service';
import { RefundCollecteService } from './application/services/refund-collecte.service';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';

/**
 * Bounded Context **Subscription** (§3.2, M6) : la souscription obligataire —
 * un investisseur souscrit des fractions d'un projet EN_COLLECTE, signe son
 * bulletin, et peut se rétracter dans la fenêtre PSFP de 4 jours (non-averti).
 *
 * Position dans la Context Map (§3.4) :
 *
 * - **aval** de `compliance` (éligibilité, catégorie, plafond conseillé — lu
 *   via `PROFIL_PP_REPOSITORY`, traduit par `EligibilitePsfpTranslator`), de
 *   `catalog` (statut du projet, fractions — `PROJECT_REPOSITORY`, traduit par
 *   `ProjetSouscriptibleTranslator`) et — à terme — de `reservation` : le fait
 *   `ReservationConvertie` est le contrat par lequel une réservation deviendra
 *   un investissement en tête de file ; sa consommation n'est pas encore
 *   branchée (la conversion reste un geste manuel du back-office) ;
 * - **amont** de `servicing` : la signature déclenche l'échéancier. La
 *   souscription lui passe une *demande* (capital, TRI, durée) et reçoit des
 *   coupons à persister ; elle ne connaît ni `Echeance` ni ses statuts.
 *
 * Le modèle riche est en place : `Investment` est un agrégat à transitions
 * (rétractation PSFP, complément de fractions), `CollecteCapacity` possède
 * l'invariant d'anti-survente (§6), `InvestmentFactory` la naissance (§23),
 * `EcheancierGenerator` et ses stratégies le calcul des coupons (§38.1), et le
 * contexte porte ses propres erreurs métier (§21) et ses faits publiés (§12).
 *
 * Écarts temporaires, assumés et à résorber (§3.3) :
 *
 * - le module enregistre encore des entités d'autres contextes
 *   (`TypeOrmModule.forFeature` sur Project, Wallet, User, Document,
 *   Signature, Transaction, Echeance) : les sections transactionnelles y
 *   accèdent par l'`EntityManager`, faute d'unité de travail partagée — résorber cela
 *   demande un port de transaction, pas un remodelage du domaine ;
 * - les faits publiés le sont après commit, en best-effort : les rendre
 *   fiables demande l'Outbox (§19).
 */
@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      ProjectEntity,
      InvestmentEntity,
      DocumentEntity,
      SignatureEntity,
      WalletEntity,
      UserEntity,
      UserEmailEntity,
      EcheanceEntity,
      TransactionEntity,
    ]),
    SubscriptionInfrastructureModule,
    IamInfrastructureModule,
    CatalogInfrastructureModule,
    TreasuryInfrastructureModule,
    DocumentsInfrastructureModule,
    UsersInfrastructureModule,
    ProfilesInfrastructureModule,
    CloudStorageModule,
    YouSignModule,
    NotificationsModule,
    // `KycValidatedGuard` : investir exige un dossier vérifié.
    KycModule,
  ],
  providers: [
    CreateInvestmentUseCase,
    ContractGeneratorService,
    TopUpInvestmentUseCase,
    InitiateInvestmentUseCase,
    RetractInvestmentUseCase,
    CollecteCloseCronService,
    RefundCollecteService,
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§21), la présentation s'en charge.
    { provide: APP_FILTER, useClass: SubscriptionErrorFilter },
  ],
  controllers: [InvestmentController],
  exports: [
    RefundCollecteService,
  ],
})
export class SubscriptionModule {}
