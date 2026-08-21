import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MfaMethodEntity } from 'src/iam/infrastructure/persistence/entities/mfa-method.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { USER_REPOSITORY } from 'src/iam/domain/repositories/user.repository';
import { UserTypeOrmRepository } from 'src/iam/infrastructure/repositories/user.repository';

// Les entités MFA étaient enregistrées ici ; elles appartiennent à IAM et sont
// désormais déclarées par AuthenticationModule, en une seule classe.
@Module({
  imports: [
    // `UserPreferencesEntity` a son propre module d'infrastructure — même
    // contexte, autre feature (CRP, §24).
    //
    // `MfaMethodEntity` est arrivée en sens inverse : l'adresse email et les
    // facteurs d'authentification sont des **entités de l'agrégat `User`**,
    // chacune dans sa table mais aucune dans son propre agrégat. Elles se
    // chargent et se sauvegardent avec la racine, par un repository unique.
    TypeOrmModule.forFeature([UserEmailEntity, UserEntity, MfaMethodEntity]),
  ],
  providers: [{ provide: USER_REPOSITORY, useClass: UserTypeOrmRepository }],
  exports: [USER_REPOSITORY],
})
export class UsersInfrastructureModule {}
