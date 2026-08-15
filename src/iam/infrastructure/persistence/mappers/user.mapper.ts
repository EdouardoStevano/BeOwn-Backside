import { User } from 'src/iam/domains/models/user';
// Aliasé : le domaine a lui aussi un `UserMapper`, qui traduit entre l'entité
// et ses représentations. Celui-ci ne fait que la moitié ORM du chemin et
// délègue l'autre.
import { UserMapper as UserDomainMapper } from 'src/iam/domains/mappers/user.mapper';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';

/**
 * Traduction entre l'entité ORM et le compte du domaine (§12.7 : deux classes
 * distinctes reliées par un mapper). L'état complet de `User` ne se manipule
 * que par `UserDomainMapper` — les use cases, eux, n'ont accès qu'aux méthodes
 * métier de l'entité.
 */
export class UserMapper {
  static toDomain(entity: UserEntity): User {
    return UserDomainMapper.restore({
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
      // La table `user_emails` reste une ligne à part — le découpage de
      // stockage ne suit pas celui du domaine, et c'est le rôle de ce mapper
      // (§12.7). Côté domaine, ces trois colonnes sont des champs de l'agrégat.
      email: entity.userEmail?.email ?? null,
      emailVerified: entity.userEmail?.isVerified ?? false,
      emailVerifiedDate: entity.userEmail?.verifiedDate ?? null,
    });
  }

  static toEntity(domain: User): UserEntity {
    const snapshot = UserDomainMapper.toSnapshot(domain);
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

    if (snapshot.email !== null) {
      const emailEntity = new UserEmailEntity();
      emailEntity.email = snapshot.email;
      emailEntity.isVerified = snapshot.emailVerified;
      emailEntity.verifiedDate = snapshot.emailVerifiedDate;
      emailEntity.user = entity;

      if (snapshot.userId) {
        emailEntity.userId = snapshot.userId;
      }
      entity.userEmail = emailEntity;
    }

    return entity;
  }
}
