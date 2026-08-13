import { UserEmail } from 'src/iam/domains/value-objects/user-email.vo';
import {
  FirstName,
  LastName,
} from 'src/iam/domains/value-objects/person-name.vo';
import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';
import { User, type UserSnapshot } from 'src/iam/domains/models/user';

/**
 * Représentation exposable du compte : ce que le domaine accepte de publier.
 * L'empreinte du mot de passe en est absente par construction — c'est un type,
 * pas une convention, donc l'oubli est impossible.
 */
export interface PublicUser {
  userId: number;
  firstname: string;
  lastname: string | null;
  socialId: string | null;
  role: UserRole;
  status: UserStatus;
  cguAccepteesLe: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userEmail: UserEmail | null;
}

/**
 * Traductions entre le compte et ses représentations : celle de la
 * persistance (`UserSnapshot`, faite de primitives) et celle qu'on publie
 * (`PublicUser`).
 *
 * `User` portait ces trois méthodes en plus de ses règles métier — deux
 * raisons de changer pour une même classe (§4 — SRP). Elles vivent désormais
 * ici : ajouter une projection (vue admin, export, résumé d'annuaire) ne rouvre
 * plus l'entité, et changer la forme de stockage non plus.
 *
 * Homonyme du mapper de `infrastructure/persistence/mappers/`, sans
 * recouvrement : celui-là traduit vers TypeORM et ne connaît que des entités
 * ORM ; celui-ci reste dans le domaine et n'a aucune dépendance technique.
 * C'est d'ailleurs le mapper d'infrastructure qui appelle celui-ci.
 */
export class UserMapper {
  /**
   * Reconstitution depuis la persistance.
   *
   * Les noms passent par `restore` et non par `of` : une ligne écrite avant que
   * la règle n'existe doit rester lisible. Valider au chargement rendrait un
   * compte inaccessible, y compris pour corriger la valeur fautive. La
   * validation, elle, s'applique à la **création** (`User.register`) et au
   * **renommage** (`User.rename`), c'est-à-dire quand une valeur entre.
   */
  static restore(snapshot: UserSnapshot): User {
    return new User({
      userId: snapshot.userId,
      firstname: FirstName.restore(snapshot.firstname),
      lastname: LastName.restore(snapshot.lastname),
      socialId: snapshot.socialId,
      passwordHash: snapshot.passwordHash,
      role: snapshot.role,
      status: snapshot.status,
      cguAccepteesLe: snapshot.cguAccepteesLe,
      lastLoginAt: snapshot.lastLoginAt,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      userEmail: snapshot.userEmail,
    });
  }

  /**
   * État complet, empreinte du mot de passe comprise — destiné aux mappers de
   * persistance, à personne d'autre. Assemblé depuis les getters publics, sauf
   * l'empreinte qui n'en a pas : c'est la seule ouverture que l'entité
   * consent, et elle est marquée `@internal`.
   *
   * Le snapshot reste fait de primitives : la persistance ne change pas parce
   * que le domaine s'est doté de Value Objects.
   */
  static toSnapshot(user: User): UserSnapshot {
    return {
      userId: user.userId,
      firstname: user.firstname,
      lastname: user.lastname,
      socialId: user.socialId,
      passwordHash: user.passwordHash,
      role: user.role,
      status: user.status,
      cguAccepteesLe: user.cguAccepteesLe,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      userEmail: user.userEmail,
    };
  }

  /**
   * Projection publiable — **sans l'empreinte du mot de passe**.
   *
   * Recopie champ à champ, et non un snapshot privé d'une clé : un attribut
   * ajouté demain au compte n'est alors pas publié tant que personne ne l'a
   * décidé. C'est le bon défaut pour un type dont tout le rôle est de dire ce
   * qui sort du domaine — l'oubli y coûte une fuite, jamais un champ manquant,
   * que le compilateur signale de toute façon.
   */
  static toPublic(user: User): PublicUser {
    return {
      userId: user.userId,
      firstname: user.firstname,
      lastname: user.lastname,
      socialId: user.socialId,
      role: user.role,
      status: user.status,
      cguAccepteesLe: user.cguAccepteesLe,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      userEmail: user.userEmail,
    };
  }
}
