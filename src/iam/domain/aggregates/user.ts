import { MfaMethodType } from 'src/iam/domain/enums/mfa-method.enum';
import { MfaMethod } from 'src/iam/domain/entities/mfa-method';
import { Email } from 'src/iam/domain/value-objects/email.vo';
import { NumeroTelephone } from 'src/iam/domain/value-objects/numero-telephone.vo';
import {
  FirstName,
  LastName,
} from 'src/iam/domain/value-objects/person-name.vo';
import { UserRole, UserStatus, UserType } from 'src/iam/domain/enums/user.enum';
import {
  InvalidUserStatusError,
  InvalidUserTypeError,
  STATUTS_ADMINISTRABLES,
} from 'src/iam/domain/errors/user-administration.errors';
import { FacteursMfaNonChargesError } from 'src/iam/domain/errors/mfa.errors';
import { EmailAlreadyRegisteredError } from 'src/iam/domain/errors/authentication.errors';
import {
  AccesReserveAuCgpError,
  DejaRattacheAUnCgpError,
  RattachementASoiMemeError,
} from 'src/iam/domain/errors/cgp.errors';
import { CodeParrainageCgp } from 'src/iam/domain/value-objects/code-parrainage-cgp.vo';
import {
  UserMapper,
  type PublicUser,
  type PublicUserMfa,
} from 'src/iam/domain/mappers/user.mapper';

/**
 * Ordre dans lequel un facteur est retenu quand le compte en a plusieurs.
 * Voir {@link User.facteurActif} pour le pourquoi de cet ordre.
 */
const PREFERENCE_FACTEURS: readonly MfaMethodType[] = [
  MfaMethodType.TOTP,
  MfaMethodType.SMS,
  MfaMethodType.EMAIL,
];

/**
 * Compare un mot de passe en clair à son empreinte. Injecté à l'appel plutôt
 * qu'au constructeur : le domaine exprime le besoin (« sais-tu comparer deux
 * mots de passe ? ») sans dépendre de bcrypt ni d'un service NestJS (§12.1).
 */
export type PasswordComparator = (
  plain: string,
  hash: string,
) => Promise<boolean>;

/** État complet du compte, tel qu'il transite depuis/vers la persistance. */
export interface UserSnapshot {
  userId: number;
  firstname: string;
  lastname: string | null;
  socialId: string | null;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  /** Type d'investisseur annoncé à l'ouverture du compte — PP ou PM. */
  userType: UserType | null;
  /** Moyen de joindre le titulaire — canal de rappel du conseil PSFP. */
  telephone: string | null;
  cguAccepteesLe: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Primitives, comme le reste du snapshot — le VO ne franchit pas la frontière. */
  email: string | null;
  emailVerified: boolean;
  emailVerifiedDate: Date | null;
  /**
   * Entités de l'agrégat, transportées telles quelles : elles ont leur propre
   * table et leur propre cycle de vie, et n'ont donc pas de forme plate à
   * prendre ici. Absentes quand la lecture ne les a pas chargées.
   */
  facteurs?: MfaMethod[];
  /** Conseiller de rattachement, et code publié quand le titulaire en est un. */
  cgpId: number | null;
  codeParrainageCgp: string | null;
}

/**
 * État interne du compte : le snapshot, mais avec ses Value Objects plutôt que
 * les primitives qu'attend la persistance.
 *
 * @internal Ce que reçoit le constructeur. La traduction dans un sens
 * (persistance → VO permissifs) appartient à `UserMapper`, dans l'autre
 * (entrée → VO validants) à `User.register`.
 */
export interface UserState {
  userId: number;
  firstname: FirstName;
  lastname: LastName | null;
  socialId: string | null;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  userType: UserType | null;
  telephone: NumeroTelephone | null;
  cguAccepteesLe: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  email: Email | null;
  emailVerified: boolean;
  emailVerifiedDate: Date | null;
  /** Absents quand la lecture ne les a pas chargés — voir `User._facteurs`. */
  facteurs?: MfaMethod[] | null;
  cgpId: number | null;
  codeParrainageCgp: CodeParrainageCgp | null;
}

export interface RegisterUserProps {
  firstname: string;
  lastname: string | null;
  email: string;
  /** Déjà hachée — le domaine ne connaît aucun algorithme de hachage. */
  passwordHash: string | null;
  socialId: string | null;
  emailVerified?: boolean;
}

/**
 * Compte utilisateur.
 *
 * L'état est privé et exposé en **lecture seule**. Toute comparaison et toute
 * transition passent par une méthode de cette classe : `isSuspended()`,
 * `markEmailAsVerified()`, `changePassword()`… Auparavant les champs étaient
 * publics et mutables, ce qui avait deux conséquences :
 *
 * - l'empreinte du mot de passe circulait librement (`user.password`) et
 *   chaque appelant refaisait la comparaison à la main ;
 * - les règles de statut étaient dupliquées dans cinq use cases sous forme de
 *   `user.status === UserStatus.CLOS || user.status === UserStatus.SUPPRIME`.
 *   Ajouter un statut imposait de retrouver toutes ces copies.
 *
 * L'empreinte du mot de passe ne sort que par le getter `passwordHash`, marqué
 * `@internal` et destiné au seul `UserMapper` : un use case qui doit éprouver
 * un mot de passe passe par `verifyPassword()`, qui ne rend qu'un verdict.
 *
 * La conversion vers les représentations sortantes (snapshot de persistance,
 * projection publiable) appartient à `UserMapper` — cette classe ne porte plus
 * que le métier (§4 — SRP).
 *
 * **Elle n'hérite plus de rien.** Elle étendait `AggregateRoot` de
 * `@nestjs/cqrs`, ce que §32 interdit explicitement — un agrégat ne connaît
 * pas le framework. L'héritage était de surcroît inutile : ni `apply()`, ni
 * `commit()`, ni `getUncommittedEvents()` n'étaient appelés nulle part. Les
 * événements de ce contexte sont publiés par les use cases, comme dans les neuf
 * autres. Seul `super()` en témoignait.
 */
export class User {
  private _userId: number;
  private _firstname: FirstName;
  private _lastname: LastName | null;
  private _socialId: string | null;
  private _passwordHash: string | null;
  private _role: UserRole;
  private _status: UserStatus;
  /**
   * Type d'investisseur **annoncé**, distinct du type **effectif** que le
   * contexte Profiles déduit du dossier réellement créé. Il est posé à la
   * première étape du parcours, avant qu'aucun profil n'existe — c'est
   * précisément ce qu'aucune déduction ne peut exprimer.
   */
  private _userType: UserType | null;
  /**
   * Numéro de rappel. Il vivait sur le profil investisseur, où il faisait
   * doublon avec un compte qui n'en portait pas : un titulaire sans dossier
   * était injoignable, et supprimer son profil aurait effacé son numéro.
   */
  private _telephone: NumeroTelephone | null;
  private _cguAccepteesLe: Date | null;
  private _lastLoginAt: Date | null;
  private _createdAt: Date;
  private _updatedAt: Date;
  /**
   * L'adresse et son état de vérification, tenus par la racine.
   *
   * Ils formaient un seul VO `UserEmail` mutable, dont `verify()` faisait
   * avancer une transition métier hors de l'agrégat : `markEmailAsVerified()`
   * devait déléguer la moitié du travail à l'objet valeur et garder l'autre
   * (le passage CREE → EMAIL_VERIFIE). La règle « adresse vérifiée » et la
   * règle « compte activé » étant la même décision, elles vivent au même
   * endroit. Le VO ne conserve que ce qui définit vraiment une valeur.
   */
  private _email: Email | null;
  private _emailVerified: boolean;
  private _emailVerifiedDate: Date | null;
  /**
   * Facteurs d'authentification enrôlés — **entités de cet agrégat**.
   *
   * `null` signifie « non chargés », et non « aucun » : le compte est lu des
   * dizaines de fois par requête pour son rôle ou son statut, et joindre à
   * chaque fois une table qui porte des secrets chiffrés serait payer cher un
   * état dont presque personne n'a besoin. Les parcours MFA passent donc par
   * `findByIdWithFacteurs`, et toute transition sur un compte dont les facteurs
   * ne sont pas chargés lève plutôt que de deviner (§6 — un agrégat partiel ne
   * se modifie pas).
   */
  private _facteurs: MfaMethod[] | null;
  /**
   * Conseiller auquel ce titulaire est rattaché, et code que ce titulaire
   * publie s'il est lui-même conseiller.
   *
   * Les deux colonnes existaient depuis toujours et n'étaient écrites que par
   * `CgpController`, qui les posait sur `UserEntity` en direct : l'agrégat ne
   * les connaissait pas, donc aucune règle ne les protégeait. On pouvait se
   * rattacher à soi-même, et un compte déjà rattaché voyait son conseiller
   * remplacé sans que rien ne s'y oppose sur la route d'administration.
   */
  private _cgpId: number | null;
  private _codeParrainageCgp: CodeParrainageCgp | null;

  /**
   * @internal Réservé à `User.register` et à `UserMapper`.
   *
   * Public faute de mieux : TypeScript n'a pas de classe amie, et `UserMapper`
   * — qui reconstitue un compte depuis la persistance — doit pouvoir
   * l'appeler. Il n'ouvre rien de plus que l'ancien `User.restore`, public lui
   * aussi. Les invariants restent portés par `register()`, seul chemin de
   * **création** d'un compte : passer par ici, c'est se déclarer mapper.
   */
  constructor(state: UserState) {
    this._userId = state.userId;
    this._firstname = state.firstname;
    this._lastname = state.lastname;
    this._socialId = state.socialId;
    this._passwordHash = state.passwordHash;
    this._role = state.role;
    this._status = state.status;
    this._userType = state.userType;
    this._telephone = state.telephone;
    this._cguAccepteesLe = state.cguAccepteesLe;
    this._lastLoginAt = state.lastLoginAt;
    this._createdAt = state.createdAt;
    this._updatedAt = state.updatedAt;
    this._email = state.email;
    this._emailVerified = state.emailVerified;
    this._emailVerifiedDate = state.emailVerifiedDate;
    this._facteurs = state.facteurs ?? null;
    this._cgpId = state.cgpId;
    this._codeParrainageCgp = state.codeParrainageCgp;
  }

  /** Nouveau compte : statut CREE, identifiants non encore vérifiés. */
  static register(props: RegisterUserProps): User {
    // `Email.of` et non une simple normalisation : une adresse malformée est
    // désormais refusée à la création, quel que soit le point d'entrée. Elle ne
    // l'était nulle part côté domaine — seul le DTO HTTP contrôlait, donc un
    // import ou un profil OAuth pouvait faire naître un compte injoignable.
    const email = Email.of(props.email);

    return new User({
      userId: undefined as unknown as number, // attribué par la persistance
      // Éprouvés ici et non par l'appelant : un compte ne peut pas naître avec
      // un prénom vide, quel que soit le point d'entrée (HTTP, import, script).
      firstname: FirstName.of(props.firstname),
      lastname: LastName.of(props.lastname),
      socialId: props.socialId,
      passwordHash: props.passwordHash,
      role: UserRole.INVESTISSEUR,
      status: UserStatus.CREE,
      // Rien n'est annoncé à l'inscription : le titulaire choisit son type à
      // la première étape du parcours d'onboarding, et donne son numéro en
      // complétant son profil.
      userType: null,
      telephone: null,
      cguAccepteesLe: null,
      lastLoginAt: null,
      createdAt: undefined as unknown as Date,
      updatedAt: undefined as unknown as Date,
      email,
      // Un compte social arrive avec une adresse déjà éprouvée par le
      // fournisseur : la date de vérification est celle de l'inscription.
      emailVerified: props.emailVerified === true,
      emailVerifiedDate: props.emailVerified === true ? new Date() : null,
      // Personne ne s'inscrit déjà parrainé : le rattachement se demande
      // ensuite, code en main (`rattacherAu`).
      cgpId: null,
      codeParrainageCgp: null,
    });
  }

  // ── Lectures (aucun setter) ───────────────────────────────────────────────

  get userId(): number {
    return this._userId;
  }
  /** Le VO reste interne : les appelants continuent de lire des chaînes. */
  get firstname(): string {
    return this._firstname.value;
  }
  get lastname(): string | null {
    return this._lastname?.value ?? null;
  }
  get socialId(): string | null {
    return this._socialId;
  }
  get role(): UserRole {
    return this._role;
  }
  /** Type annoncé, `null` tant que le titulaire n'a pas choisi. */
  get userType(): UserType | null {
    return this._userType;
  }
  get telephone(): string | null {
    return this._telephone?.value ?? null;
  }
  get status(): UserStatus {
    return this._status;
  }
  get cguAccepteesLe(): Date | null {
    return this._cguAccepteesLe;
  }
  get lastLoginAt(): Date | null {
    return this._lastLoginAt;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
  /** Conseiller de rattachement, `null` quand le titulaire n'en a pas. */
  get cgpId(): number | null {
    return this._cgpId;
  }
  /** Le VO reste interne : les appelants lisent une chaîne, comme ailleurs. */
  get codeParrainageCgp(): string | null {
    return this._codeParrainageCgp?.valeur ?? null;
  }
  /** Raccourci de lecture — l'adresse est toujours présente en pratique. */
  get email(): string {
    return this._email?.value ?? '';
  }
  /** @internal Réservé à `UserMapper`, qui a besoin de la valeur nullable. */
  get emailOrNull(): string | null {
    return this._email?.value ?? null;
  }
  get emailVerifiedDate(): Date | null {
    return this._emailVerifiedDate;
  }

  // ── Règles métier ─────────────────────────────────────────────────────────

  /** Un compte social sans mot de passe ne peut pas se connecter par mot de passe. */
  hasPassword(): boolean {
    return this._passwordHash !== null && this._passwordHash !== undefined;
  }

  /**
   * Seul point de sortie de l'empreinte : elle n'est jamais retournée, on ne
   * renvoie que le verdict. Un compte sans mot de passe échoue toujours,
   * plutôt que de laisser l'appelant déréférencer `password!`.
   */
  async verifyPassword(
    plain: string,
    compare: PasswordComparator,
  ): Promise<boolean> {
    if (!this.hasPassword()) return false;
    return compare(plain, this._passwordHash as string);
  }

  isEmailVerified(): boolean {
    return this._emailVerified;
  }

  isSuspended(): boolean {
    return this._status === UserStatus.SUSPENDU;
  }

  /** CLOS et SUPPRIME sont traités ensemble partout : une seule règle ici. */
  isClosed(): boolean {
    return (
      this._status === UserStatus.CLOS || this._status === UserStatus.SUPPRIME
    );
  }

  isDeleted(): boolean {
    return this._status === UserStatus.SUPPRIME;
  }

  /**
   * Un compte sanctionné ne doit jamais obtenir de nouveaux tokens, quel que
   * soit le flux (connexion, OTP d'inscription, OAuth).
   */
  canOpenSession(): boolean {
    return !this.isSuspended() && !this.isClosed();
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Le titulaire annonce s'il ouvre un compte de personne physique ou morale.
   *
   * Écrit jusqu'ici par `(user as any).userType = …` depuis le contrôleur : la
   * propriété atterrissait sur l'objet, le mapper l'ignorait, et la route
   * rendait 200 sans rien persister. La colonne existe pourtant, et
   * `cgp.controller` l'affiche — elle était donc vide pour tout le monde.
   *
   * @returns `true` si l'annonce a changé — utile à l'appelant qui veut éviter
   *   une écriture inutile ou tracer la modification.
   */
  declarerType(userType: UserType): boolean {
    if (!Object.values(UserType).includes(userType)) {
      throw new InvalidUserTypeError(userType);
    }
    if (this._userType === userType) return false;

    this._userType = userType;
    return true;
  }

  // ── Facteurs d'authentification ───────────────────────────────────────────
  //
  // Le compte est la racine : un facteur ne se crée, ne s'active et ne se
  // retire qu'à travers lui. Ces méthodes ne persistent rien — c'est la
  // sauvegarde du compte qui enregistre l'état de ses facteurs.

  /**
   * Enrôle un facteur, en attente de la preuve que le titulaire le possède.
   *
   * Purge au passage les enrôlements du même canal jamais confirmés : il n'y a
   * donc **au plus un facteur en attente par canal**, et la confirmation n'a
   * jamais à deviner lequel des enrôlements inactifs on est en train de
   * prouver. Les facteurs **actifs** ne sont pas touchés — l'authenticator en
   * place continue de servir tant que le nouveau n'est pas confirmé.
   */
  enrolerFacteur(method: MfaMethodType, credential: string): MfaMethod {
    const facteurs = this.exigerFacteurs();
    const conserves = facteurs.filter(
      (facteur) => facteur.method !== method || facteur.isActive(),
    );

    const enrole = MfaMethod.enroler(method, credential);
    this._facteurs = [...conserves, enrole];
    return enrole;
  }

  /**
   * Confirme le facteur en attente d'un canal : il devient **l'unique facteur
   * actif du compte**.
   *
   * C'est ici que vit l'invariant, et non plus dans un `deactivateAll()` que
   * chaque appelant devait penser à lancer avant d'activer. L'oublier une fois
   * suffisait à laisser deux facteurs armés, dont un — le plus faible — que la
   * connexion n'opposait jamais et dont le titulaire ignorait qu'il restait
   * ouvert.
   *
   * @returns le facteur activé, `null` si ce canal n'a aucun enrôlement en
   *   attente — à l'appelant de dire que l'enrôlement n'a pas commencé.
   */
  confirmerFacteur(method: MfaMethodType): MfaMethod | null {
    const enAttente = this.facteurEnAttente(method);
    if (!enAttente) return null;

    for (const facteur of this.exigerFacteurs()) facteur.desactiver();
    enAttente.activer();
    return enAttente;
  }

  /** Retire les facteurs d'un canal — le compte peut rester protégé par un autre. */
  retirerFacteursDe(method: MfaMethodType): void {
    for (const facteur of this.exigerFacteurs()) {
      if (facteur.method === method) facteur.desactiver();
    }
  }

  /**
   * Facteur que la connexion opposera, `null` si le compte n'en a aucun d'actif.
   *
   * L'ordre de préférence est une règle du compte, pas d'un service : TOTP
   * d'abord — il ne coûte ni SMS ni email, ne dépend d'aucun réseau de
   * livraison et ne peut pas être intercepté en transit ; puis le SMS, qui
   * suppose la possession d'un appareil, avant l'email, qui est justement ce
   * que protège le mot de passe qu'on vient de saisir.
   */
  facteurActif(): MfaMethod | null {
    const facteurs = this.exigerFacteurs();
    for (const method of PREFERENCE_FACTEURS) {
      const actif = facteurs.find(
        (facteur) => facteur.method === method && facteur.isActive(),
      );
      if (actif) return actif;
    }
    return null;
  }

  /** Les facteurs ont-ils été chargés ? Seule la persistance a besoin de le savoir. */
  get facteursCharges(): boolean {
    return this._facteurs !== null;
  }

  /** Facteurs actifs d'un canal donné. */
  facteursActifsDe(method: MfaMethodType): MfaMethod[] {
    return this.exigerFacteurs().filter(
      (facteur) => facteur.method === method && facteur.isActive(),
    );
  }

  /** Enrôlement de ce canal jamais confirmé, `null` s'il n'y en a pas. */
  facteurEnAttente(method: MfaMethodType): MfaMethod | null {
    return (
      this.exigerFacteurs().find(
        (facteur) => facteur.method === method && facteur.isPending(),
      ) ?? null
    );
  }

  /** Un facteur actif de ce canal protège-t-il déjà cette destination ? */
  protegeDeja(method: MfaMethodType, destination: string): boolean {
    return this.exigerFacteurs().some(
      (facteur) => facteur.method === method && facteur.isActiveOn(destination),
    );
  }

  /** Tous les facteurs du compte, actifs ou non — pour les projections. */
  get facteurs(): readonly MfaMethod[] {
    return this.exigerFacteurs();
  }

  /**
   * Refuse de travailler sur un compte dont les facteurs n'ont pas été
   * chargés : rendre une liste vide ferait passer « je ne sais pas » pour
   * « il n'y en a aucun », et une confirmation d'enrôlement effacerait alors
   * silencieusement le facteur en place.
   */
  private exigerFacteurs(): MfaMethod[] {
    if (this._facteurs === null) throw new FacteursMfaNonChargesError();
    return this._facteurs;
  }

  /**
   * Enregistre le numéro de rappel du titulaire.
   *
   * Déclaré depuis le formulaire de complétion du profil investisseur, mais
   * écrit ici : c'est le compte qui le porte. `null` l'efface, `undefined`
   * n'y touche pas — la distinction que le formulaire progressif exige.
   *
   * @returns `true` si le numéro a changé.
   */
  changerTelephone(raw: string | null | undefined): boolean {
    if (raw === undefined) return false;

    const telephone = NumeroTelephone.of(raw);
    if (telephone?.value === this._telephone?.value) return false;

    this._telephone = telephone;
    return true;
  }

  /**
   * Change le statut du compte — sanction ou remise en service, décidées par
   * l'administration.
   *
   * Le contrôleur d'administration écrivait `(user as any).status = dto.status`
   * sur un accesseur en lecture seule : en mode strict, l'affectation **lève
   * une TypeError**, et la route rendait 500 dès qu'un statut était fourni.
   * Rien ne vérifiait non plus que la valeur reçue appartenait à
   * l'énumération, si bien qu'une chaîne quelconque serait entrée en base.
   *
   * Les statuts du cycle de vie interne — CREE, EMAIL_VERIFIE — ne sont pas
   * administrables : ils sont posés par la vérification d'adresse, et les
   * repositionner à la main désynchroniserait le compte de son email.
   *
   * @returns `true` si le statut a changé.
   */
  changerStatut(statut: UserStatus): boolean {
    if (!STATUTS_ADMINISTRABLES.includes(statut)) {
      throw new InvalidUserStatusError(statut);
    }
    if (this._status === statut) return false;

    this._status = statut;
    return true;
  }

  /**
   * Vérifie l'adresse et fait avancer le cycle de vie du compte. Le passage
   * CREE → EMAIL_VERIFIE était recopié dans trois use cases ; il vit ici, de
   * sorte qu'aucun appelant ne puisse vérifier l'email en oubliant le statut.
   */
  markEmailAsVerified(): void {
    // Idempotent : re-vérifier une adresse déjà vérifiée ne déplace pas la date.
    if (!this._emailVerified) {
      this._emailVerified = true;
      this._emailVerifiedDate = new Date();
    }
    if (this._status === UserStatus.CREE) {
      this._status = UserStatus.EMAIL_VERIFIE;
    }
  }

  /** `hash` est déjà haché par l'appelant (port de hachage). */
  changePassword(hash: string): void {
    this._passwordHash = hash;
  }

  /**
   * Le compte existe mais n'a jamais confirmé son adresse : l'inscription
   * n'est pas allée à son terme.
   *
   * Les deux conditions plutôt qu'une : `CREE` est bien l'état d'un compte non
   * vérifié, mais c'est `emailVerified` qui fait foi — et un compte sanctionné
   * ou clos n'est pas une inscription en chemin, c'est un compte qu'on a
   * fermé. Aucun des deux ne se reprend.
   */
  inscriptionInachevee(): boolean {
    return !this._emailVerified && this._status === UserStatus.CREE;
  }

  /**
   * **Reprendre une inscription restée en chemin** — le compte garde son
   * identifiant, mais celui qui se présente redéclare son identité et son mot
   * de passe.
   *
   * Le besoin est concret : qui laisse expirer son lien de vérification se
   * retrouvait dehors, l'adresse étant « déjà prise » par un compte dont
   * personne n'avait prouvé la possession — et qu'aucun parcours ne permettait
   * de récupérer.
   *
   * **Reprendre ce compte n'ouvre rien à personne**, et c'est ce qui rend
   * l'opération sûre : tant que l'adresse n'est pas vérifiée, `SignInUseCase`
   * refuse la connexion (`EmailNotVerifiedError`). Un compte resté à `CREE`
   * n'a donc jamais pu ouvrir de session, ni enrôler de facteur, ni renseigner
   * un téléphone ou un profil : c'est une coquille vide. Le seul chemin qui
   * mène quelque part reste le lien envoyé à l'adresse — et il n'arrive qu'à
   * celui qui la relève.
   *
   * > ⚠️ Cette sûreté tient à ce refus de connexion. Si un jour un compte non
   * > vérifié pouvait ouvrir une session, il faudrait aussi effacer ici ce que
   * > l'occupant précédent y aurait laissé.
   */
  reprendreInscription(props: {
    firstname: string;
    lastname: string | null;
    passwordHash: string;
  }): void {
    if (!this.inscriptionInachevee()) {
      throw new EmailAlreadyRegisteredError();
    }

    this.rename(props.firstname, props.lastname);
    this.changePassword(props.passwordHash);
  }

  /**
   * Renvoie `true` si quelque chose a changé — utile pour l'audit.
   *
   * Les valeurs passent par les VO, donc renommer obéit exactement aux mêmes
   * règles que s'inscrire. Auparavant la seule barrière était `UpdateUserDto`,
   * et elle exigeait 2 caractères là où `SignUpDto` se contentait d'un champ
   * non vide : le même compte pouvait naître avec un prénom d'une lettre mais
   * ne plus pouvoir y revenir.
   */
  rename(firstname?: string, lastname?: string | null): boolean {
    let changed = false;

    if (firstname !== undefined) {
      const next = FirstName.of(firstname);
      if (!next.equals(this._firstname)) {
        this._firstname = next;
        changed = true;
      }
    }

    if (lastname !== undefined) {
      const next = LastName.of(lastname);
      const unchanged = next
        ? next.equals(this._lastname)
        : this._lastname === null;
      if (!unchanged) {
        this._lastname = next;
        changed = true;
      }
    }

    return changed;
  }

  markAsDeleted(): void {
    this._status = UserStatus.SUPPRIME;
  }

  // ── Rattachement à un conseiller (CGP) ────────────────────────────────────

  /** Ce titulaire distribue-t-il des offres pour le compte d'investisseurs ? */
  estCgp(): boolean {
    return this._role === UserRole.CGP;
  }

  /**
   * Publie — ou renouvelle — le code que les investisseurs saisiront pour se
   * rattacher à ce conseiller.
   *
   * Renouveler est permis et invalide le précédent : c'est ce que fait déjà
   * `PATCH /cgp/me/referral-code`, et c'est le seul recours quand un code a
   * fuité. En revanche seul un CGP en publie un — la route le vérifiait, mais
   * rien n'empêchait un autre appelant d'écrire la colonne.
   *
   * @throws AccesReserveAuCgpError si le titulaire n'a pas le rôle CGP.
   */
  publierCodeParrainage(code: CodeParrainageCgp): void {
    if (!this.estCgp()) {
      throw new AccesReserveAuCgpError();
    }
    this._codeParrainageCgp = code;
  }

  /**
   * Rattache ce titulaire à un conseiller.
   *
   * Deux règles, dont aucune n'existait vraiment :
   *
   * - **un seul conseiller à la fois.** `PATCH /cgp/join/:code` refusait bien
   *   un second rattachement, mais `PATCH /cgp/clients/:id/link` — la route
   *   d'administration — écrasait le conseiller en place sans rien dire. Le
   *   refus vit maintenant dans l'agrégat, donc il vaut pour les deux chemins ;
   * - **on n'est pas son propre conseiller.** Rien ne l'interdisait : un CGP
   *   qui saisissait son propre code se rattachait à lui-même, et apparaissait
   *   ensuite dans sa propre liste de clients.
   *
   * @returns `true` si le rattachement a changé quelque chose — un titulaire
   *   déjà rattaché **au même** conseiller n'est pas une erreur, c'est un
   *   rejeu.
   * @throws RattachementASoiMemeError, DejaRattacheAUnCgpError
   */
  rattacherAu(cgpId: number): boolean {
    if (cgpId === this._userId) {
      throw new RattachementASoiMemeError();
    }
    if (this._cgpId === cgpId) return false;
    if (this._cgpId !== null) {
      throw new DejaRattacheAUnCgpError();
    }

    this._cgpId = cgpId;
    return true;
  }

  // ── Sérialisation ─────────────────────────────────────────────────────────

  /**
   * Représentation exposable du compte — **sans l'empreinte du mot de passe**.
   *
   * La mise en forme appartient à {@link UserMapper} (§4 — SRP) ; seul le point
   * d'accroche reste ici, et il doit y rester : `res.json()` appelle
   * automatiquement `toJSON()`, ce qui protège aussi les chemins de
   * sérialisation indirects — un `User` glissé dans une réponse sans passer par
   * un appel explicite. Sans cette méthode, il ressortirait avec ses clés
   * privées `_userId`, `_firstname`… et surtout `_passwordHash`.
   *
   * `mfa` est le seul apport extérieur : le second facteur ne fait pas partie
   * de l'agrégat, l'appelant qui l'a chargé le passe ici. Omis — cas de la
   * sérialisation automatique par `res.json()` — la clé n'apparaît tout
   * simplement pas.
   */
  toJSON(mfa?: PublicUserMfa): PublicUser {
    return UserMapper.toPublic(this, mfa);
  }

  get passwordHash(): string | null {
    return this._passwordHash;
  }
}
