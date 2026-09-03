import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './presenters/http/payment.controller';
import { StripePaymentService } from './infrastructure/stripe-payment.service';
import { StripeIdentityServiceImpl } from './infrastructure/stripe-identity.service';
import { StripeConnectService } from './infrastructure/stripe-connect.service';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { PAYMENT_SERVICE } from './applications/ports/payment.service';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { ProfilesModule } from 'src/profiles/applications/profiles.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { TransactionalEmailModule } from 'src/shared/email/transactional-email.module';
import { AmlModule } from 'src/common/aml/aml.module';
import { DepotCleanupCronService } from './applications/depot-cleanup-cron.service';
import { RetraitSettlementService } from './applications/services/retrait-settlement.service';
import { RetraitsReaperService } from './applications/retraits-reaper.service';
import { AdminRetraitsReapController } from './presenters/http/admin-retraits-reap.controller';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { RequestRetraitUseCase } from './applications/usecases/request-retrait.usecase';
import { CrediterApportPorteurUseCase } from './applications/usecases/crediter-apport-porteur.usecase';
import { VerserPorteurUseCase } from './applications/usecases/verser-porteur.usecase';
import { GetPorteurTresorerieUseCase } from './applications/usecases/get-porteur-tresorerie.usecase';
import { AdminVersementPorteurController } from './presenters/http/admin-versement-porteur.controller';
import { PorteurTresorerieController } from './presenters/http/porteur-tresorerie.controller';
import { WalletsModule } from 'src/wallets/applications/wallets.module';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { PayoutMethodsController } from './presenters/http/payout-methods.controller';
import { StripePayoutMethodsService } from './infrastructure/stripe-payout-methods.service';
import { ManagePayoutMethodsUseCase } from './applications/usecases/manage-payout-methods.usecase';
import { PayoutDestinationResolver } from './applications/services/payout-destination.resolver';
import { ConnectAccountReader } from './applications/ports/connect-account.port';
import { InvestorIdentityReader } from './applications/ports/investor-identity.port';
import { ProfilInvestorIdentityAdapter } from './infrastructure/profil-investor-identity.adapter';
import { KycDocumentSource } from './applications/ports/kyc-document.port';
import { StripeIdentityKycDocumentAdapter } from './infrastructure/stripe-identity-kyc-document.adapter';
import {
  PayoutMethodsReader,
  PayoutMethodsWriter,
} from './applications/ports/payout-methods.port';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      WalletEntity,
      TransactionEntity,
      KycEntity,
      UserEntity,
      // Apport porteur : le projet est LU pour vérifier l'appartenance avant
      // toute création d'intention de paiement et avant tout crédit.
      ProjectEntity,
    ]),
    WalletsInfrastructureModule,
    // `ResolveProjectWalletUseCase` — résolution (et création à la demande) du
    // portefeuille technique du projet alimenté, sous le verrou de la ligne
    // projet. Le module wallets en est le propriétaire ; payments le consomme.
    WalletsModule,
    IamInfrastructureModule,
    ProfilesModule,
    CloudStorageModule,
    NotificationsModule,
    // E-mails « dépôt confirmé », « retrait effectué », « identité vérifiée ».
    TransactionalEmailModule,
    // Vigilance LCB-FT sur les dépôts et les retraits (art. L.561-10 CMF).
    AmlModule,
  ],
  controllers: [
    PaymentController,
    PayoutMethodsController,
    AdminVersementPorteurController,
    // Trésorerie d'un projet lue par SON porteur (versements reçus, apports).
    PorteurTresorerieController,
    // Déclenchement manuel du rattrapage des retraits (`POST /admin/retraits/reap`).
    AdminRetraitsReapController,
  ],
  providers: [
    { provide: PAYMENT_SERVICE, useClass: StripePaymentService },
    StripePaymentService,
    StripeIdentityServiceImpl,
    StripeConnectService,
    RequestRetraitUseCase,
    // Clôture d'un retrait dont le sort est connu, PARTAGÉE par le webhook
    // `payout.*` et le balayage de rattrapage : deux déclencheurs, une seule
    // séquence, donc aucune divergence possible entre les deux.
    RetraitSettlementService,
    RetraitsReaperService,
    CrediterApportPorteurUseCase,
    VerserPorteurUseCase,
    GetPorteurTresorerieUseCase,
    KycValidatedGuard,
    // ─── Lot 4a — destinations de retrait (DIP) ──────────────────────────
    // Un seul adaptateur Stripe branché derrière DEUX ports séparés (ISP) :
    // le chemin retrait n'injecte que le Reader et ne peut donc pas modifier
    // les destinations de l'investisseur.
    StripePayoutMethodsService,
    { provide: PayoutMethodsReader, useExisting: StripePayoutMethodsService },
    { provide: PayoutMethodsWriter, useExisting: StripePayoutMethodsService },
    { provide: ConnectAccountReader, useExisting: StripeConnectService },
    // Pré-remplissage de l'onboarding Connect : `payments` déclare le besoin
    // (le port), `profiles` fournit la donnée. Changer de source d'identité ne
    // touche que cette ligne et l'adaptateur.
    { provide: InvestorIdentityReader, useClass: ProfilInvestorIdentityAdapter },
    // Pièce d'identité du KYC attachée au compte Connect à sa création :
    // l'exigence de document (seuil de volume) est pré-satisfaite, plus
    // d'« Action requise » côté investisseur. Source = fichiers Stripe
    // Identity ; changer de source ne touche que l'adaptateur.
    { provide: KycDocumentSource, useClass: StripeIdentityKycDocumentAdapter },
    PayoutDestinationResolver,
    ManagePayoutMethodsUseCase,
    DepotCleanupCronService,
  ],
  exports: [
    PAYMENT_SERVICE,
    StripeIdentityServiceImpl,
    StripeConnectService,
    // Le client Stripe est instancié UNE fois ici (clés à un seul endroit).
    // La réconciliation financière a besoin du solde plateforme : elle passe
    // par son propre port (`PlateformeBalanceReader`) dont l'adaptateur
    // réutilise ce service au lieu de relire les clés.
    StripePaymentService,
  ],
})
export class PaymentsModule {}
