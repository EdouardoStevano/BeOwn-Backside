import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionInfrastructureModule } from './infrastructure/subscription-infrastructure.module';
import { CatalogInfrastructureModule } from 'src/catalog/infrastructure/catalog-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/compliance/infrastructure/profiles-infrastructure.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { YouSignModule } from 'src/common/yousign/yousign.module';
import { CreateInvestmentUseCase } from './application/usecases/create-investment.usecase';
import { ContractGeneratorService } from './application/services/contract-generator.service';
import { TopUpInvestmentUseCase } from './application/usecases/top-up-investment.usecase';
import { InitiateInvestmentUseCase } from './application/usecases/initiate-investment.usecase';
import { CancelInvestmentUseCase } from './application/usecases/cancel-investment.usecase';
import { InvestmentController } from './presentation/http/investment.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { KycModule } from 'src/compliance/application/kyc.module';
import { EcheanceEntity } from 'src/subscription/infrastructure/persistence/entities/echeance.entity';
import { EcheancesCronService } from './application/services/echeances-cron.service';
import { IfuGenerationService } from './application/services/ifu-generation.service';
import { PayEcheanceUseCase } from './application/usecases/pay-echeance.usecase';
import { ProjectScheduleGeneratorService } from './application/services/project-schedule-generator.service';
import { CollecteCloseCronService } from './application/services/collecte-close-cron.service';
import { RefundCollecteService } from './application/services/refund-collecte.service';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';

/**
 * Bounded Context **Subscription** (§3.2, M6) : la souscription obligataire —
 * un investisseur souscrit des fractions d'un projet EN_COLLECTE, signe son
 * bulletin, et peut se rétracter dans la fenêtre PSFP de 4 jours (non-averti).
 *
 * Position dans la Context Map (§3.4) :
 *
 * - **aval** de `compliance` (éligibilité, catégorie, plafond conseillé), de
 *   `catalog` (statut du projet, fractions) et — à terme — de `reservation` :
 *   le fait `ReservationConvertie` est le contrat par lequel une réservation
 *   deviendra un investissement en tête de file ; sa consommation n'est pas
 *   encore branchée (la conversion reste un geste manuel du back-office) ;
 * - **amont** de `servicing` : la signature déclenche l'échéancier.
 *
 * Écarts temporaires, assumés et à résorber (§3.3) :
 *
 * - l'échéancier vit encore ici (`Echeance`, `PayEcheanceUseCase`, crons de
 *   retard) alors qu'il appartient à `servicing` (M8, `RepaymentSchedule`) ;
 * - `IfuGenerationService` appartient à `regulatory-reporting` (M11) ;
 * - le module enregistre encore des entités d'autres contextes
 *   (`TypeOrmModule.forFeature` sur Project, Wallet, User, Document,
 *   Signature, Transaction) : des use cases accèdent à leur base sans passer
 *   par un port — le symptôme §12 que `catalog` a déjà résorbé chez lui.
 *
 * Ce module donne au contexte son nom et sa forme (§5) ; le modèle riche
 * (`Investment` en agrégat à transitions, erreurs de domaine, événements)
 * est l'étape suivante — même découpage en deux temps que `compliance`.
 */
@Module({
  imports: [
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
    WalletsInfrastructureModule,
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
    CancelInvestmentUseCase,
    EcheancesCronService,
    IfuGenerationService,
    PayEcheanceUseCase,
    ProjectScheduleGeneratorService,
    CollecteCloseCronService,
    RefundCollecteService,
  ],
  controllers: [InvestmentController],
  exports: [
    PayEcheanceUseCase,
    IfuGenerationService,
    ProjectScheduleGeneratorService,
    RefundCollecteService,
  ],
})
export class SubscriptionModule {}
