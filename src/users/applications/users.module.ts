import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersInfrastructureModule } from '../infrastructure/users-infrastructure.module';
import { UserController } from '../presenters/http/user.controller';
import { UserFactory } from '../domains/factories/user.factory';
import { USER_ACCOUNT_SERVICE } from './contracts/user-account.contract';
import { UsersAccountService } from './services/user-account.service';
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
    // Contrat publié : c'est par ce token, et lui seul, que les autres contextes
    // (IAM) atteignent Users.
    { provide: USER_ACCOUNT_SERVICE, useExisting: UsersAccountService },
  ],
  controllers: [UserController],
  exports: [USER_ACCOUNT_SERVICE],
})
export class UsersModule {}
