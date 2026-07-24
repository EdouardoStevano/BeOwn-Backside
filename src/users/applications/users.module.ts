import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersInfrastructureModule } from '../infrastructure/users-infrastructure.module';
import { UserController } from '../presenters/http/user.controller';
import { RegisterUseCase } from './usecases/register.usecase';
import { DeleteAccountUseCase } from './usecases/delete-account.usecase';
import { UserFactory } from '../domains/factories/user.factory';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { BrevoEmailService } from 'src/common/email/brevo.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { DocumentsInfrastructureModule } from 'src/documents/infrastructure/documents-infrastructure.module';
import { WalletsInfrastructureModule } from 'src/wallets/infrastructure/wallets-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { RegistrationOtpModule } from 'src/iam/applications/authentication/application/registration-otp.module';
import { UserEntity } from '../infrastructure/persistences/entities/user.entity';
import { NotificationEntity } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { InvestorInactivityCronService } from './investor-inactivity-cron.service';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';

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
    DeleteAccountUseCase,
    InvestorInactivityCronService,
    UserFactory,
    { provide: HASHING_SERVICE, useClass: BcryptService },
    // EMAIL_SERVICE est lié par module (pas de binding global) — même pattern
    // que AdminModule/NotificationsModule.
    { provide: EMAIL_SERVICE, useClass: BrevoEmailService },
  ],
  controllers: [UserController],
  exports: [UserFactory, DeleteAccountUseCase],
})
export class UsersModule {}
