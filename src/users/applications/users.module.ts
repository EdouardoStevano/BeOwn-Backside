import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersService } from './users.service';
import { UsersInfrastructureModule } from '../infrastructure/users-infrastructure.module';
import { UserController } from '../presenters/http/user.controller';
import { RegisterHandler } from './commands/register.handler';
import { UserFactory } from '../domains/factories/user.factory';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    CqrsModule,
    UsersInfrastructureModule,
    IamInfrastructureModule,
    ProfilesInfrastructureModule,
    DocumentsInfrastructureModule,
    WalletsInfrastructureModule,
    NotificationsModule,
  ],
  providers: [
    UsersService,
    RegisterHandler,
    UserFactory,
    { provide: HASHING_SERVICE, useClass: BcryptService },
  ],
  controllers: [UserController],
  exports: [UserFactory],
})
export class UsersModule {}
