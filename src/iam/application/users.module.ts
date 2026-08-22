import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { UserController } from 'src/iam/presentation/http/user.controller';
import { DeleteAccountUseCase } from 'src/iam/application/usecases/account/delete-account.usecase';
import { DeleteMyAccountUseCase } from 'src/iam/application/usecases/account/delete-my-account.usecase';
import {
  DeclareUserTypeUseCase,
  UpdateMyAccountUseCase,
} from 'src/iam/application/usecases/account/update-my-account.usecase';
import { UpdateUserByAdminUseCase } from 'src/iam/application/usecases/account/update-user-by-admin.usecase';
import { UserFactory } from '../domain/factories/user.factory';
import { HASHING_SERVICE } from 'src/iam/domain/ports/hashing.service';
import { BcryptService } from 'src/iam/infrastructure/crypto/bcrypt.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { NotificationEntity } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { InvestorInactivityCronService } from 'src/iam/application/services/investor-inactivity-cron.service';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructure/persistence/entities/ordre-marche.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';

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
    // Fournit `TokenService` au JwtAuthGuard que `UserController` monte via
    // @UseGuards.
    IamInfrastructureModule,
    // Profiles, Preferences, Documents et Treasury étaient importés ici pour la
    // seule composition de `GET /users/me` et `GET /users/:id`. Ces deux
    // lectures sont parties dans `AccountOverviewModule`, et avec elles les
    // quatre arêtes qui faisaient dépendre IAM — le contexte dont tous les
    // autres dépendent — de contextes situés en aval de lui.
    //
    // Ne pas les réimporter : une route d'IAM qui a besoin d'un autre contexte
    // est une route qui appartient à un module de composition, pas à IAM.
    NotificationsModule,
  ],
  providers: [
    DeleteAccountUseCase,
    // Un use case par route du contrôleur : la présentation ne parle plus
    // qu'à la couche applicative (§2).
    UpdateMyAccountUseCase,
    DeclareUserTypeUseCase,
    UpdateUserByAdminUseCase,
    DeleteMyAccountUseCase,
    InvestorInactivityCronService,
    UserFactory,
    { provide: HASHING_SERVICE, useClass: BcryptService },
  ],
  controllers: [UserController],
  exports: [UserFactory, DeleteAccountUseCase],
})
export class UsersModule {}
