import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersInfrastructureModule } from '../infrastructure/users-infrastructure.module';
import { UserController } from '../presenters/http/user.controller';
import { RegisterUseCase } from './usecases/register.usecase';
import { UserFactory } from '../domains/factories/user.factory';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { RegistrationOtpModule } from 'src/iam/applications/authentication/application/registration-otp.module';

@Module({
  imports: [
    UsersInfrastructureModule,
    IamInfrastructureModule,
    ProfilesInfrastructureModule,
    DocumentsInfrastructureModule,
    WalletsInfrastructureModule,
    NotificationsModule,
    RegistrationOtpModule,
  ],
  providers: [
    UsersService,
    RegisterUseCase,
    UserFactory,
    { provide: HASHING_SERVICE, useClass: BcryptService },
  ],
  controllers: [UserController],
  exports: [UserFactory],
})
export class UsersModule {}
