import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { UserController } from 'src/iam/presenters/http/user.controller';
import { DeleteAccountUseCase } from 'src/iam/applications/usecases/users/delete-account.usecase';
import { UserFactory } from 'src/iam/domains/factories/user.factory';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { NotificationEntity } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { InvestorInactivityCronService } from 'src/iam/applications/services/users/investor-inactivity-cron.service';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';

/**
 * Feature « compte utilisateur » du Bounded Context IAM — au même rang
 * qu'`AuthenticationModule`, l'autre feature du contexte.
 *
 * Le compte a longtemps été un contexte à part (`src/users/`) ; il a été
 * absorbé par IAM, qui possède désormais le référentiel utilisateur en plus de
 * l'authentification. Les autres contextes accèdent au compte via
 * `USER_REPOSITORY`, exporté par `UsersInfrastructureModule`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      NotificationEntity,
      InvestmentEntity,
      OrdreMarcheEntity,
      WalletEntity,
      TransactionEntity,
    ]),
    UsersInfrastructureModule,
    // Fournit TOKEN_SERVICE au JwtAuthGuard que `UserController` monte via
    // @UseGuards.
    IamInfrastructureModule,
    ProfilesInfrastructureModule,
    DocumentsInfrastructureModule,
    WalletsInfrastructureModule,
    NotificationsModule,
  ],
  providers: [
    DeleteAccountUseCase,
    InvestorInactivityCronService,
    UserFactory,
    { provide: HASHING_SERVICE, useClass: BcryptService },
  ],
  controllers: [UserController],
  exports: [UserFactory, DeleteAccountUseCase],
})
export class UsersModule {}
