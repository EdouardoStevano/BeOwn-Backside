import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './presenters/http/payment.controller';
import { StripePaymentService } from './infrastructure/stripe-payment.service';
import { StripeIdentityServiceImpl } from './infrastructure/stripe-identity.service';
import { SumsubService } from './infrastructure/sumsub.service';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { PAYMENT_SERVICE } from './applications/ports/payment.service';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { ProfilesModule } from 'src/profiles/applications/profiles.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([WalletEntity, TransactionEntity]),
    WalletsInfrastructureModule,
    IamInfrastructureModule,
    ProfilesModule,
  ],
  controllers: [PaymentController],
  providers: [
    { provide: PAYMENT_SERVICE, useClass: StripePaymentService },
    StripePaymentService,
    StripeIdentityServiceImpl,
    SumsubService,
  ],
  exports: [PAYMENT_SERVICE, StripeIdentityServiceImpl, SumsubService],
})
export class PaymentsModule {}
