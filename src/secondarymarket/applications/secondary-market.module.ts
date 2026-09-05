import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecondaryMarketInfrastructureModule } from '../infrastructure/secondary-market-infrastructure.module';
import { SecondaryMarketController } from '../presenters/http/secondary-market.controller';
import { YouSignWebhookController } from '../presenters/http/yousign-webhook.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { YouSignModule } from 'src/common/yousign/yousign.module';
import { SignatureProviderModule } from 'src/signatures/infrastructure/signature-provider.module';
import { ContractGeneratorService } from 'src/investments/applications/usecases/contract-generator.service';
import { InitiateBuyUseCase } from './usecases/initiate-buy.usecase';
import { ExprimerInteretUseCase } from './usecases/exprimer-interet.usecase';
import { RepondreInteretUseCase } from './usecases/repondre-interet.usecase';
import { CancelInitiationUseCase } from './usecases/cancel-initiation.usecase';
import { ExpirerSignatureCessionUseCase } from './usecases/expirer-signature-cession.usecase';
import { CessionCompensationService } from './cession-compensation.service';
import { AnnoncesExpiryCronService } from './annonces-expiry-cron.service';
import { SignaturesExpiryCronService } from './signatures-expiry-cron.service';
import { OrdresOrphelinsCronService } from './ordres-orphelins-cron.service';
import { InteretsExpiryCronService } from './interets-expiry-cron.service';
import { VerrouCronService } from 'src/common/cron/verrou-cron.service';
import { DevisCessionService } from './devis-cession.service';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { UsersModule } from 'src/iam/applications/users.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { SignaturesModule } from 'src/signatures/applications/signatures.module';
import { AmlModule } from 'src/common/aml/aml.module';
import { ConflitsInteretsModule } from 'src/projects/applications/conflits-interets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycEntity, ProjectEntity, UserEntity, InvestmentEntity]),
    SecondaryMarketInfrastructureModule,
    IamInfrastructureModule,
    NotificationsModule,
    CloudStorageModule,
    // YouSignModule reste importé pour le presenter du webhook
    // (verifyWebhookSignature, spécifique YouSign) ; les use cases passent par
    // le port SignatureProvider.
    YouSignModule,
    SignatureProviderModule,
    UsersModule,
    UsersInfrastructureModule,
    // Règlement des contrats signés — partagé entre le webhook YouSign et le
    // parcours d'acceptation certifiée (provider de repli).
    SignaturesModule,
    // Gel des avoirs : la garde 403 AVOIRS_GELES protège l'expression
    // d'intérêt et l'initiation d'achat (port GelDesAvoirsPort).
    AmlModule,
    // Conflits d'intérêts (décision D5) : le porteur d'un projet ne rachète
    // pas les parts de sa propre société support — garde posée sur l'ACHETEUR
    // aux trois étapes du parcours de cession.
    ConflitsInteretsModule,
  ],
  providers: [
    ContractGeneratorService,
    // Devis de frais servi avant tout engagement. `PlatformFeesService` vient
    // du module global `PlatformFeesModule` : aucun import supplémentaire.
    DevisCessionService,
    // Réservation des fonds à l'acceptation et compensation d'une cession qui
    // n'aboutit pas — partagée par l'acceptation, l'annulation, l'expiration
    // par webhook et le cron de sécurité.
    CessionCompensationService,
    InitiateBuyUseCase,
    ExprimerInteretUseCase,
    RepondreInteretUseCase,
    CancelInitiationUseCase,
    ExpirerSignatureCessionUseCase,
    // Balayages d'expiration : annonces échues (quotidien) et signatures non
    // recueillies (horaire, indépendant du webhook prestataire).
    AnnoncesExpiryCronService,
    SignaturesExpiryCronService,
    // Filet de sécurité complémentaire : ordres restés ACCEPTE sans aucune
    // signature vivante (mort du processus en pleine acceptation, compensation
    // échouée) — le balayage des signatures ne peut pas les voir.
    OrdresOrphelinsCronService,
    // Expiration des marques d'intérêt sans réponse (72 h configurables), et
    // le verrou distribué qu'elle consomme.
    InteretsExpiryCronService,
    VerrouCronService,
    KycValidatedGuard,
  ],
  controllers: [SecondaryMarketController, YouSignWebhookController],
})
export class SecondaryMarketModule {}
