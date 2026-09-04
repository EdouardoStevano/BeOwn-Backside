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
      cguVersionAcceptee: entity.cguVersionAcceptee,
      cguAcceptationIp: entity.cguAcceptationIp,
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

    // Le rôle voyage désormais avec le compte. Il ne l'était PAS : toute
    // écriture passant par `UserRepository.update()` (renommage, vérification
    // d'email, réinitialisation de mot de passe…) reconstruisait une entité
    // sans `role`. TypeORM ignore les colonnes `undefined`, donc la valeur en
    // base survivait par accident — mais rien ne le garantissait, et l'agrégat
    // et sa ligne divergeaient silencieusement. Aucun setter de domaine ne
    // touche au rôle : ce mapping réécrit la valeur relue, il ne peut pas en
    // inventer une (l'attribution reste le seul fait de l'endpoint admin).
    if (snapshot.role) entity.role = snapshot.role;

    // `userType` (colonne `users.userType`) n'est délibérément PAS mappé : il
    // n'appartient pas à l'agrégat. La source de vérité du type de compte est
    // la présence d'un profil PP ou PM — c'est ce que `GET /users/me` déduit
    // pour construire les étapes d'onboarding. La colonne ne conserve que la
    // déclaration d'intention faite à l'étape 1 du parcours, et elle est écrite
    // explicitement par `UserRepository.updateUserType()`. La porter ici
    // obligerait le domaine à héberger un champ qu'aucune règle métier n'oppose
    // jamais.

    // Preuve de consentement CGU (lot 2 RGPD). `cguAccepteesLe` existait dans
    // le domaine mais n'était PAS mappé ici : la valeur posée par
    // `User.register` était perdue au save(). Les trois champs voyagent
    // ensemble — null reste null (comptes OAuth, stock antérieur au lot 2).
    entity.cguAccepteesLe = snapshot.cguAccepteesLe;
    entity.cguVersionAcceptee = snapshot.cguVersionAcceptee;
    entity.cguAcceptationIp = snapshot.cguAcceptationIp;

    if (snapshot.email !== null) {
      const emailEntity = new UserEmailEntity();
      emailEntity.email = snapshot.email;
      emailEntity.isVerified = snapshot.emailVerified;
      emailEntity.verifiedDate = snapshot.emailVerifiedDate;
      emailEntity.user = entity;
      // Pas de clé primaire ici : `user_emails.userId` est une séquence propre
      // à la table, rien ne garantit qu'elle vaille l'id du compte (les deux
      // divergent dès qu'une ligne est insérée hors application). La poser à
      // l'aveugle faisait INSÉRER une seconde ligne pour le même compte —
      // violation de l'unicité `user_id`. C'est le repository qui relit la clé
      // réelle de la ligne existante avant le save() (voir `update`).
      entity.userEmail = emailEntity;
    }

    return entity;
  }
}
