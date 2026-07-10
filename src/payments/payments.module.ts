import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './presenters/http/payment.controller';
import { StripePaymentService } from './infrastructure/stripe-payment.service';
import { StripeIdentityServiceImpl } from './infrastructure/stripe-identity.service';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { PAYMENT_SERVICE } from './applications/ports/payment.service';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { ProfilesModule } from 'src/profiles/applications/profiles.module';
import { CloudStorageModule } from 'src/common/cloud-storage/cloud-storage.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([WalletEntity, TransactionEntity, KycEntity]),
    WalletsInfrastructureModule,
    IamInfrastructureModule,
    ProfilesModule,
    CloudStorageModule,
    NotificationsModule,
  ],
  controllers: [PaymentController],
  providers: [
    { provide: PAYMENT_SERVICE, useClass: StripePaymentService },
    StripePaymentService,
    StripeIdentityServiceImpl,
    KycValidatedGuard,
  ],
  exports: [PAYMENT_SERVICE, StripeIdentityServiceImpl],
})
export class PaymentsModule {}
