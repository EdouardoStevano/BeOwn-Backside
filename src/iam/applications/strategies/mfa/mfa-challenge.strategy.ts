import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';

/** Ce qu'un canal rend en émettant son défi. */
export interface MfaChallengeEmission {
  /**
   * Destination du code lorsqu'il a fallu l'envoyer. Absente pour TOTP : rien
   * n'est transmis, l'utilisateur lit son application.
   */
  sentTo?: string;
}

/**
 * Un facteur enrôlé, tel qu'on peut le **montrer** à son titulaire.
 *
 * `credential` n'y figure pas et ne doit jamais y figurer : il porte le secret
 * TOTP chiffré, dont la seule sortie légitime est `SecretCipher` au moment
 * d'une vérification. Ce que voit l'utilisateur, c'est le canal, son état, et
 * une destination **masquée** pour les canaux qui en ont une.
 */
export interface MfaMethodSummary {
  method: MfaMethodType;
  /** `false` = enrôlement commencé mais jamais confirmé. */
  isActive: boolean;
  /** Destination masquée. Absente pour TOTP, qui n'envoie rien. */
  sentTo?: string;
}

/**
 * Un canal 2FA vu depuis la **vérification**, par opposition à
 * {@link MfaEnrollmentStrategy} qui le voit depuis l'enrôlement.
 *
 * Deux familles distinctes plutôt qu'une interface unique (ISP, §4) : enrôler,
 * c'est créer une méthode en attente et prouver qu'on la possède une première
 * fois ; vérifier, c'est éprouver une méthode **déjà active**. Les deux
 * partagent le canal mais ni les repositories interrogés, ni les erreurs, ni
 * le cycle de vie — les fusionner obligerait chaque implémentation à porter
 * des méthodes qui ne la concernent pas.
 *
 * Ajouter un canal reste une classe de plus enregistrée dans
 * `AuthenticationModule`, sans toucher aux use cases (§4 Open/Closed).
 */
export interface MfaChallengeStrategy {
  /** Canal couvert — clé de résolution dans le registre. */
  readonly method: MfaMethodType;

  /**
   * Le compte a-t-il ce canal **actif** ? Sert à choisir le facteur à opposer
   * à la connexion, et à refuser une désactivation sans objet.
   */
  isActiveFor(userId: number): Promise<boolean>;

  /**
   * Facteurs de ce canal enrôlés par le compte, pour affichage. Rend aussi les
   * enrôlements non confirmés : ils occupent la place du canal jusqu'au
   * prochain `POST /auth/mfa/enroll`, et les taire ferait apparaître un canal
   * comme libre alors qu'il attend une confirmation.
   */
  describeFor(userId: number): Promise<MfaMethodSummary[]>;

  /**
   * Émet le défi : envoie un code sur les canaux qui en transportent un, ne
   * fait rien pour TOTP. Appelé une fois le challenge décidé, jamais pour
   * savoir s'il y a lieu de le faire.
   */
  issue(userId: number): Promise<MfaChallengeEmission>;

  /** Éprouve le code contre la méthode active du canal. */
  verify(userId: number, code: string): Promise<boolean>;

  /** Retire le facteur du compte. */
  deactivate(userId: number): Promise<void>;
}

/** Token du tableau de stratégies injecté dans les use cases MFA. */
export const MFA_CHALLENGE_STRATEGIES = Symbol('MFA_CHALLENGE_STRATEGIES');
