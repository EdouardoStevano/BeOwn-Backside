import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './presenters/http/payment.controller';
import { StripePaymentService } from './infrastructure/stripe-payment.service';
import { StripeIdentityServiceImpl } from './infrastructure/stripe-identity.service';
import { WalletEntity } from 'src/wallets/infrastructures/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructures/persistences/entities/transaction.entity';
import { PAYMENT_SERVICE } from './applications/ports/payment.service';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructures/wallets-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([WalletEntity, TransactionEntity]),
    WalletsInfrastructureModule,
    IamInfrastructureModule,
  ],
  controllers: [PaymentController],
  providers: [
    { provide: PAYMENT_SERVICE, useClass: StripePaymentService },
    StripePaymentService,
    StripeIdentityServiceImpl,
  ],
  exports: [PAYMENT_SERVICE, StripeIdentityServiceImpl],
})
export class PaymentsModule {}
