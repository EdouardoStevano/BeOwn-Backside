import { Module } from '@nestjs/common';
import { ParrainageModule } from 'src/parrainage/parrainage.module';
import { UserPreferencesEntity } from 'src/iam/infrastructure/persistence/entities/user-preferences.entity';
import { ReinvestirLoyersService } from './services/reinvestir-loyers.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestmentsInfrastructureModule } from '../infrastructure/investments-infrastructure.module';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructure/projects-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { SignatureProviderModule } from 'src/signatures/infrastructure/signature-provider.module';
import { CreateInvestmentUseCase } from './usecases/create-investment.usecase';
import { ContractGeneratorService } from './usecases/contract-generator.service';
import { TopUpInvestmentUseCase } from './usecases/top-up-investment.usecase';
import { InitiateInvestmentUseCase } from './usecases/initiate-investment.usecase';
import { CancelInvestmentUseCase } from './usecases/cancel-investment.usecase';
import { InvestmentController } from '../presenters/http/investment.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AmlModule } from 'src/common/aml/aml.module';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { EcheancesCronService } from './echeances-cron.service';
import { IfuGenerationService } from './ifu-generation.service';
import { PayEcheanceUseCase } from './usecases/pay-echeance.usecase';
import { ProjectScheduleGeneratorService } from './project-schedule-generator.service';
import { CollecteCloseCronService } from './collecte-close-cron.service';
import { RefundCollecteService } from './refund-collecte.service';
import { ConfirmRetractationCronService } from './confirm-retractation-cron.service';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { WalletsModule } from 'src/wallets/applications/wallets.module';
import { ConflitsInteretsModule } from 'src/projects/applications/conflits-interets.module';

@Module({
  imports: [
    // Bonus de parrainage au premier investissement définitif (cron + averti).
    ParrainageModule,
    TypeOrmModule.forFeature([
      // Réinvestissement des loyers : lecture de l'opt-in.
      UserPreferencesEntity,
      ProjectEntity,
      InvestmentEntity,
      DocumentEntity,
      SignatureEntity,
      WalletEntity,
      UserEntity,
      UserEmailEntity,
      KycEntity,
      EcheanceEntity,
      TransactionEntity,
    ]),
    InvestmentsInfrastructureModule,
    IamInfrastructureModule,
    ProjectsInfrastructureModule,
    WalletsInfrastructureModule,
    // Grand livre interne : résolution idempotente du wallet projet
    // (souscription, top-up, remboursement, dénouement d'escrow) et état
    // financier constaté à la clôture de collecte.
    WalletsModule,
    DocumentsInfrastructureModule,
    UsersInfrastructureModule,
    ProfilesInfrastructureModule,
    CloudStorageModule,
    // Port SignatureProvider (DIP) — consommé par InitiateInvestmentUseCase
    // (parcours 410, conservé mais débranché).
    SignatureProviderModule,
    NotificationsModule,
    // Vigilance LCB-FT sur la souscription (art. L.561-10 CMF) : alerte,
    // jamais blocage.
    AmlModule,
    // Conflits d'intérêts (décision D5) : le porteur d'un projet n'y souscrit
    // pas, n'y ajoute pas de fractions et n'y ouvre pas de parcours de
    // signature.
    ConflitsInteretsModule,
  ],
  providers: [
    ReinvestirLoyersService,
    CreateInvestmentUseCase,
    ContractGeneratorService,
    TopUpInvestmentUseCase,
    InitiateInvestmentUseCase,
    CancelInvestmentUseCase,
    KycValidatedGuard,
    EcheancesCronService,
    IfuGenerationService,
    PayEcheanceUseCase,
    ProjectScheduleGeneratorService,
    CollecteCloseCronService,
    RefundCollecteService,
    ConfirmRetractationCronService,
  ],
  controllers: [InvestmentController],
  exports: [
    // Consommé par ExecuteDistributionUseCase (DistributionsModule).
    ReinvestirLoyersService,
    PayEcheanceUseCase,
    IfuGenerationService,
    ProjectScheduleGeneratorService,
    RefundCollecteService,
  ],
})
export class InvestmentsModule {}
