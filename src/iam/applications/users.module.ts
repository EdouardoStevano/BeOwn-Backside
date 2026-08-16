import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { UserController } from 'src/iam/presenters/http/user.controller';
import { DeleteAccountUseCase } from 'src/iam/applications/usecases/account/delete-account.usecase';
import { DeleteMyAccountUseCase } from 'src/iam/applications/usecases/account/delete-my-account.usecase';
import { GetMyAccountUseCase } from 'src/iam/applications/usecases/account/get-my-account.usecase';
import { GetUserAccountUseCase } from 'src/iam/applications/usecases/account/get-user-account.usecase';
import {
  DeclareUserTypeUseCase,
  UpdateMyAccountUseCase,
} from 'src/iam/applications/usecases/account/update-my-account.usecase';
import { UpdateUserByAdminUseCase } from 'src/iam/applications/usecases/account/update-user-by-admin.usecase';
import { UserFactory } from '../domains/factories/user.factory';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { ProfilesModule } from 'src/profiles/applications/profiles.module';
import { PreferencesModule } from 'src/preferences/applications/preferences.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { NotificationEntity } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { InvestorInactivityCronService } from 'src/iam/applications/services/investor-inactivity-cron.service';
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
    // Fournit `TokenService` au JwtAuthGuard que `UserController` monte via
    // @UseGuards.
    IamInfrastructureModule,
    ProfilesInfrastructureModule,
    // Pour `GetOnboardingStatusUseCase` : l'avancement du dossier réglementaire
    // est calculé par le contexte à qui il appartient, `GET /users/me` ne fait
    // que le composer avec le compte.
    ProfilesModule,
    // Pour `GetPreferencesUseCase` : `GET /users/me` publie les réglages du
    // titulaire à côté de son compte.
    PreferencesModule,
    DocumentsInfrastructureModule,
    WalletsInfrastructureModule,
    NotificationsModule,
  ],
  providers: [
    DeleteAccountUseCase,
    // Un use case par route du contrôleur : la présentation ne parle plus
    // qu'à la couche applicative (§2).
    GetMyAccountUseCase,
    GetUserAccountUseCase,
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
