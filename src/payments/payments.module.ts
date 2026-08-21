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
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { RequestRetraitUseCase } from './applications/usecases/request-retrait.usecase';
import { PayoutMethodsController } from './presenters/http/payout-methods.controller';
import { StripePayoutMethodsService } from './infrastructure/stripe-payout-methods.service';
import { ManagePayoutMethodsUseCase } from './applications/usecases/manage-payout-methods.usecase';
import { PayoutDestinationResolver } from './applications/services/payout-destination.resolver';
import { ConnectAccountReader } from './applications/ports/connect-account.port';
import {
  PayoutMethodsReader,
  PayoutMethodsWriter,
} from './applications/ports/payout-methods.port';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([WalletEntity, TransactionEntity, KycEntity, UserEntity]),
    WalletsInfrastructureModule,
    IamInfrastructureModule,
    ProfilesModule,
    CloudStorageModule,
    NotificationsModule,
  ],
  controllers: [PaymentController, PayoutMethodsController],
  providers: [
    { provide: PAYMENT_SERVICE, useClass: StripePaymentService },
    StripePaymentService,
    StripeIdentityServiceImpl,
    StripeConnectService,
    RequestRetraitUseCase,
    KycValidatedGuard,
    // ─── Lot 4a — destinations de retrait (DIP) ──────────────────────────
    // Un seul adaptateur Stripe branché derrière DEUX ports séparés (ISP) :
    // le chemin retrait n'injecte que le Reader et ne peut donc pas modifier
    // les destinations de l'investisseur.
    StripePayoutMethodsService,
    { provide: PayoutMethodsReader, useExisting: StripePayoutMethodsService },
    { provide: PayoutMethodsWriter, useExisting: StripePayoutMethodsService },
    { provide: ConnectAccountReader, useExisting: StripeConnectService },
    PayoutDestinationResolver,
    ManagePayoutMethodsUseCase,
  ],
  exports: [PAYMENT_SERVICE, StripeIdentityServiceImpl, StripeConnectService],
})
export class PaymentsModule {}
