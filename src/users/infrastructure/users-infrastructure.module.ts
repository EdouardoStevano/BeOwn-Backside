import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEmailEntity } from './persistences/entities/user-email.entity';
import { UserEntity } from './persistences/entities/user.entity';
import { UserPreferencesEntity } from './persistences/entities/user-preferences.entity';
import { USER_REPOSITORY } from '../applications/ports/repositories/user.repository';
import { TFA_REPOSITORY } from '../applications/ports/repositories/tfa.repository';
import { UserTypeOrmRepository } from './persistences/repositories/user.repository';
import { TfaTypeOrmRepository } from './persistences/repositories/tfa.repository';
import { TFAMethodEntity } from './persistences/entities/tfa-method.entity';
import { SMSMethodEntity } from './persistences/entities/sms-method.entity';
import { TOTPMethodEntity } from './persistences/entities/totp-method.entity';
import { EmailMethodEntity } from './persistences/entities/email-method.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEmailEntity,
      UserEntity,
      UserPreferencesEntity,
      TFAMethodEntity,
      SMSMethodEntity,
      TOTPMethodEntity,
      EmailMethodEntity,
    ]),
  ],
  providers: [
    { provide: USER_REPOSITORY, useClass: UserTypeOrmRepository },
    { provide: TFA_REPOSITORY, useClass: TfaTypeOrmRepository },
  ],
  exports: [USER_REPOSITORY, TFA_REPOSITORY],
})
export class UsersInfrastructureModule {}
