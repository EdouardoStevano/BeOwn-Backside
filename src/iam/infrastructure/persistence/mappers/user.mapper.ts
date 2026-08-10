import { User } from 'src/iam/domains/models/user';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmail } from 'src/iam/domains/value-objects/user-email.vo';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';

/**
 * Seul endroit autorisé à manipuler l'état complet de `User` : la
 * reconstitution passe par `User.restore`, la relecture par `toSnapshot()`.
 * Les use cases, eux, n'ont accès qu'aux méthodes métier de l'entité.
 */
export class UserMapper {
  static toDomain(entity: UserEntity): User {
    return User.restore({
      userId: entity.userId,
      firstname: entity.firstname,
      lastname: entity.lastname,
      socialId: entity.socialId,
      passwordHash: entity.password,
      role: entity.role,
      status: entity.status,
      cguAccepteesLe: entity.cguAccepteesLe,
      lastLoginAt: entity.lastLoginAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      userEmail: entity.userEmail
        ? UserEmail.restore(
            entity.userEmail.email,
            entity.userEmail.isVerified,
            entity.userEmail.verifiedDate,
          )
        : null,
    });
  }

  static toEntity(domain: User): UserEntity {
    const snapshot = domain.toSnapshot();
    const entity = new UserEntity();

    if (snapshot.userId) entity.userId = snapshot.userId;
    entity.firstname = snapshot.firstname;
    entity.lastname = snapshot.lastname;
    entity.socialId = snapshot.socialId;
    entity.password = snapshot.passwordHash;
    // Sans ce mapping, un changement de statut au niveau domaine (ex.
    // CREE → EMAIL_VERIFIE lors de la confirmation d'email) était perdu au
    // save(). Undefined reste ignoré par TypeORM (insert → défaut CREE).
    if (snapshot.status) entity.status = snapshot.status;

    if (snapshot.userEmail) {
      const emailEntity = new UserEmailEntity();
      emailEntity.email = snapshot.userEmail.email;
      emailEntity.isVerified = snapshot.userEmail.isVerified;
      emailEntity.verifiedDate = snapshot.userEmail.verifiedDate;
      emailEntity.user = entity;

      if (snapshot.userId) {
        emailEntity.userId = snapshot.userId;
      }
      entity.userEmail = emailEntity;
    }

    return entity;
  }
}
