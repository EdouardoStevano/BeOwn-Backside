import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserPreferencesEntity } from 'src/iam/infrastructure/persistence/entities/user-preferences.entity';
import { USER_REPOSITORY } from 'src/iam/domains/ports/user.repository';
import { UserTypeOrmRepository } from 'src/iam/infrastructure/persistence/repositories/user.repository';

// Les entités MFA étaient enregistrées ici ; elles appartiennent à IAM et sont
// désormais déclarées par AuthenticationModule, en une seule classe.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEmailEntity,
      UserEntity,
      UserPreferencesEntity,
    ]),
  ],
  providers: [{ provide: USER_REPOSITORY, useClass: UserTypeOrmRepository }],
  exports: [USER_REPOSITORY],
})
export class UsersInfrastructureModule {}
