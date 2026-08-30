import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsInfrastructureModule } from '../infrastructure/wallets-infrastructure.module';
import { WalletController } from '../presenters/http/wallet.controller';
import { AdminProjectFinanceController } from '../presenters/http/admin-project-finance.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { ResolveProjectWalletUseCase } from './usecases/resolve-project-wallet.usecase';
import { ProjectLedgerService } from './project-ledger.service';

@Module({
  imports: [
    WalletsInfrastructureModule,
    IamInfrastructureModule,
    // AuditLogService (journal des versements constatés) vient de
    // NotificationsModule ; UserEntity sert à la défense en profondeur
    // (relecture du rôle en base) et ProjectEntity à la pagination du
    // tableau financier — toutes deux en LECTURE SEULE ici.
    NotificationsModule,
    TypeOrmModule.forFeature([UserEntity, ProjectEntity]),
  ],
  controllers: [WalletController, AdminProjectFinanceController],
  providers: [ResolveProjectWalletUseCase, ProjectLedgerService],
  exports: [ResolveProjectWalletUseCase, ProjectLedgerService],
})
export class WalletsModule {}
