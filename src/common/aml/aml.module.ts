import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmlMonitorService } from './aml-monitor.service';
import { AdminComplianceController } from './admin-compliance.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';

@Module({
  imports: [
    NotificationsModule,
    IamInfrastructureModule,
    // Le cumul LCB-FT du mois glissant est reconstitué depuis le grand livre :
    // en LECTURE SEULE — ce module ne doit jamais écrire un mouvement.
    TypeOrmModule.forFeature([UserEntity, WalletEntity, TransactionEntity]),
  ],
  controllers: [AdminComplianceController],
  providers: [AmlMonitorService],
  exports: [AmlMonitorService],
})
export class AmlModule {}
