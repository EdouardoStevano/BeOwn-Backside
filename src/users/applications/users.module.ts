import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersInfrastructureModule } from '../infrastructure/users-infrastructure.module';
import { UserController } from '../presenters/http/user.controller';
import { UserFactory } from '../domains/factories/user.factory';
import { USER_ACCOUNT_SERVICE } from './contracts/user-account.contract';
import { UsersAccountService } from './services/user-account.service';
import { DeleteAccountUseCase } from './usecases/delete-account.usecase';
import { RegisterHandler } from './commands/register.handler';
import { UpdateProfileHandler } from './commands/update-profile.handler';
import { UpdateUserByAdminHandler } from './commands/update-user-by-admin.handler';
import { SetUserTypeHandler } from './commands/set-user-type.handler';
import { DeleteAccountHandler } from './commands/delete-account.handler';
import { UpdatePreferencesHandler } from './commands/update-preferences.handler';
import { GetMyProfileHandler } from './queries/get-my-profile.handler';
import { GetUserByIdHandler } from './queries/get-user-by-id.handler';
import { GetPreferencesHandler } from './queries/get-preferences.handler';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UserEntity } from '../infrastructure/persistences/entities/user.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';

const CommandHandlers = [
  RegisterHandler,
  UpdateProfileHandler,
  UpdateUserByAdminHandler,
  SetUserTypeHandler,
  DeleteAccountHandler,
  UpdatePreferencesHandler,
];

const QueryHandlers = [
  GetMyProfileHandler,
  GetUserByIdHandler,
  GetPreferencesHandler,
];

@Module({
  imports: [
    CqrsModule,
    // Lecture des engagements financiers qui bloquent une suppression de compte
    // (investissements, ordres ouverts, solde) — cf. DeleteAccountUseCase.
    TypeOrmModule.forFeature([
      UserEntity,
      InvestmentEntity,
      OrdreMarcheEntity,
      WalletEntity,
      TransactionEntity,
    ]),
    UsersInfrastructureModule,
    // Consommés par la query de composition « mon compte » (cf. GetMyProfileHandler).
    ProfilesInfrastructureModule,
    DocumentsInfrastructureModule,
    WalletsInfrastructureModule,
    NotificationsModule,
  ],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    UserFactory,
    UsersAccountService,
    DeleteAccountUseCase,
    // Contrat publié : c'est par ce token, et lui seul, que les autres contextes
    // (IAM) atteignent Users.
    { provide: USER_ACCOUNT_SERVICE, useExisting: UsersAccountService },
  ],
  controllers: [UserController],
  // DeleteAccountUseCase est exporté pour la suppression déclenchée par un
  // administrateur (AdminController) : le parcours self-service passe, lui, par
  // DeleteAccountCommand.
  exports: [USER_ACCOUNT_SERVICE, DeleteAccountUseCase],
})
export class UsersModule {}
