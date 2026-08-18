import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { USER_REPOSITORY } from 'src/iam/domains/ports/user.repository';
import { UserTypeOrmRepository } from 'src/iam/infrastructure/persistence/repositories/user.repository';

// Les entités MFA étaient enregistrées ici ; elles appartiennent à IAM et sont
// désormais déclarées par AuthenticationModule, en une seule classe.
@Module({
  imports: [
    // `UserPreferencesEntity` est partie avec le contexte Preferences : les
    // réglages du titulaire ne sont pas de l'identité (§5 — CCP).
    TypeOrmModule.forFeature([UserEmailEntity, UserEntity]),
  ],
  providers: [{ provide: USER_REPOSITORY, useClass: UserTypeOrmRepository }],
  exports: [USER_REPOSITORY],
})
export class UsersInfrastructureModule {}
