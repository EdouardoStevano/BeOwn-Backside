import { Email } from 'src/iam/domains/value-objects/email.vo';
import {
  FirstName,
  LastName,
} from 'src/iam/domains/value-objects/person-name.vo';
import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { User, type UserSnapshot } from 'src/iam/domains/models/user';

/**
 * État du second facteur, tel qu'on l'expose à son titulaire.
 *
 * Le facteur n'appartient pas à l'agrégat `User` — il vit dans sa propre table
 * et n'est chargé que par les use cases qui en ont besoin. C'est pourquoi il
 * est **fourni** au mapper plutôt que lu sur l'entité : la projection dit ce
 * qui sort, elle ne va pas le chercher.
 */
export interface PublicUserMfa {
  /** `true` dès qu'un facteur est armé — la connexion l'opposera. */
  enabled: boolean;
  /** Canal du facteur actif, `null` quand `enabled` vaut `false`. */
  method: MfaMethodType | null;
}

/** Aucun facteur armé — état d'un compte qui vient d'être créé. */
export const NO_MFA: PublicUserMfa = Object.freeze({
  enabled: false,
  method: null,
});

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
  /**
   * Forme d'API inchangée par le passage de l'état de vérification dans
   * l'agrégat : le front lit toujours `userEmail.isVerified`. Ce qui était la
   * sérialisation d'un VO est désormais assemblé ici — c'est la place d'une
   * projection, et ça découple la représentation publiée du modèle interne.
   */
  userEmail: {
    email: string;
    isVerified: boolean;
    verifiedDate: Date | null;
  } | null;
  /**
   * État de la double authentification, **absent** quand l'appelant ne l'a pas
   * chargé.
   *
   * Optionnel et non `{ enabled: false }` par défaut : un compte protégé
   * passerait sinon pour un compte sans MFA sur toute route qui ne consulte pas
   * le référentiel des facteurs, et le front afficherait « désactivée » sur un
   * écran de sécurité. Absent veut dire « on n'en sait rien ici », `false` veut
   * dire « aucun facteur ». Les deux ne se confondent pas.
   *
   * Les réponses d'authentification (`AuthSession` : sign-in, sign-in/mfa,
   * refresh-tokens, exchange) le renseignent toujours.
   */
  mfa?: PublicUserMfa;
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
      cguVersionAcceptee: snapshot.cguVersionAcceptee,
      cguAcceptationIp: snapshot.cguAcceptationIp,
      lastLoginAt: snapshot.lastLoginAt,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      // `restore` et non `of`, comme les noms : une adresse enregistrée avant
      // que la règle n'existe doit rester lisible, sans quoi le compte devient
      // inaccessible — y compris pour corriger l'adresse.
      email: snapshot.email === null ? null : Email.restore(snapshot.email),
      emailVerified: snapshot.emailVerified,
      emailVerifiedDate: snapshot.emailVerifiedDate,
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
      cguVersionAcceptee: user.cguVersionAcceptee,
      cguAcceptationIp: user.cguAcceptationIp,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      email: user.emailOrNull,
      emailVerified: user.isEmailVerified(),
      emailVerifiedDate: user.emailVerifiedDate,
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
   *
   * `mfa` est le seul champ que l'entité ne porte pas : le facteur vit hors de
   * l'agrégat, et seul l'appelant qui l'a chargé peut le fournir. Omis, il ne
   * paraît pas dans la projection — voir {@link PublicUser.mfa}.
   */
  static toPublic(user: User, mfa?: PublicUserMfa): PublicUser {
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
      userEmail:
        user.emailOrNull === null
          ? null
          : {
              email: user.emailOrNull,
              isVerified: user.isEmailVerified(),
              verifiedDate: user.emailVerifiedDate,
            },
      // Étalement conditionnel : la clé n'existe pas quand l'état n'a pas été
      // chargé, plutôt que d'exister à `undefined`. `JSON.stringify` traite les
      // deux pareil, mais un `'mfa' in user` côté serveur, lui, les distingue.
      ...(mfa ? { mfa } : {}),
    };
  }
}
