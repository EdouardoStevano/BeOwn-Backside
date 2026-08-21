import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './presenters/http/payment.controller';
import { StripePaymentService } from './infrastructure/stripe-payment.service';
import { StripeConnectService } from './infrastructure/stripe-connect.service';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { PAYMENT_SERVICE } from './applications/ports/payment.service';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { KycModule } from 'src/compliance/application/kyc.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { RequestRetraitUseCase } from './applications/usecases/request-retrait.usecase';

/**
 * Dépôts, retraits et l'endpoint webhook Stripe.
 *
 * **La vérification d'identité n'est plus ici.** Ce module portait
 * `StripeIdentityServiceImpl`, l'entité ORM du dossier KYC et toute
 * l'interprétation des webhooks Identity — pour un contexte dont il ne partage
 * aucune règle. Il ne garde de KYC que ce dont un paiement a besoin :
 * `KycValidatedGuard`, pour refuser dépôt et retrait à un compte non vérifié,
 * et `HandleIdentityWebhookUseCase`, à qui le webhook partagé passe les
 * événements `identity.*` (§5 — CCP).
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([WalletEntity, TransactionEntity, UserEntity]),
    WalletsInfrastructureModule,
    IamInfrastructureModule,
    // `KycValidatedGuard` et `HandleIdentityWebhookUseCase`. La dépendance ne
    // va que dans ce sens : le contexte KYC ignore l'existence des paiements.
    KycModule,
    CloudStorageModule,
    NotificationsModule,
  ],
  controllers: [PaymentController],
  providers: [
    { provide: PAYMENT_SERVICE, useClass: StripePaymentService },
    StripePaymentService,
    StripeConnectService,
    RequestRetraitUseCase,
  ],
  exports: [PAYMENT_SERVICE, StripeConnectService],
})
export class PaymentsModule {}
