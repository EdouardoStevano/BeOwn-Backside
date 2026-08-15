import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { IamError, IamErrorKind } from './iam.error';

/** Code stable annonçant qu'il reste un second facteur à éprouver. */
export const MFA_REQUIRED_CODE = 'MFA_REQUIRED';

/** Ce qu'il faut au front pour relever le défi : où, comment, sous quel id. */
export interface MfaRequirement {
  /** À renvoyer avec le code sur `POST /auth/sign-in/mfa`. */
  challengeId: string;
  /** Canal sur lequel la preuve est attendue. */
  method: MfaMethodType;
  /** Destination masquée du code, absente pour TOTP. */
  sentTo?: string;
}

/**
 * Mot de passe accepté, connexion **non terminée** : il reste le second facteur.
 *
 * Une erreur et non une réponse à 200, alors que rien n'a échoué. Le choix est
 * assumé : un appelant qui reçoit 200 sur `POST /auth/sign-in` doit pouvoir
 * conclure qu'il tient une session. Faire porter les deux issues par le même
 * statut oblige chaque consommateur — front, SDK, test — à inspecter le corps
 * avant de savoir laquelle il a reçue, et le jour où l'un oublie ce test il lit
 * un `accessToken` absent plutôt que de suivre l'étape manquante. Le canal
 * d'erreur, lui, est déjà celui que tout client traite à part.
 *
 * C'est aussi ce que fait Auth0 (`mfa_required` + `mfa_token` sur le canal
 * d'erreur) plutôt qu'un succès polymorphe.
 *
 * `UNAUTHENTICATED` (401) et non 403 : l'identité n'est justement pas encore
 * établie — même statut que `EmailNotVerifiedError`, l'autre cas où une étape
 * manque avant qu'une session puisse s'ouvrir. Le front distingue par `code`.
 *
 * Le contexte du défi voyage dans `details`, publié tel quel à la racine du
 * corps par `IamErrorFilter` : sans lui, l'appelant saurait qu'il faut un
 * second facteur sans savoir lequel ni contre quel défi le prouver.
 */
export class MfaRequiredError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor(requirement: MfaRequirement) {
    super(
      'Double authentification requise — terminez la connexion sur POST /auth/sign-in/mfa.',
      {
        code: MFA_REQUIRED_CODE,
        details: {
          challengeId: requirement.challengeId,
          method: requirement.method,
          sentTo: requirement.sentTo,
        },
      },
    );
  }
}

/**
 * Challenge inconnu, déjà consommé ou expiré.
 *
 * Les trois cas partagent volontairement une seule erreur : les distinguer
 * apprendrait à un attaquant qu'un identifiant a existé, et la conduite à
 * tenir est la même dans les trois cas — refaire une demande.
 */
export class MfaChallengeNotFoundError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor() {
    super('Challenge inconnu ou expiré — recommencez la vérification.', {
      code: 'MFA_CHALLENGE_INVALID',
    });
  }
}

/**
 * Le challenge présenté a bien été émis, mais pour autre chose : typiquement
 * un challenge de connexion rejoué sur la désactivation. Le message reste muet
 * sur le vrai `purpose`.
 */
export class MfaChallengePurposeMismatchError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor() {
    super('Challenge inconnu ou expiré — recommencez la vérification.', {
      code: 'MFA_CHALLENGE_INVALID',
    });
  }
}

/**
 * Renvoi demandé sur un canal qui n'expédie rien — TOTP.
 *
 * Il n'y a littéralement rien à réexpédier : le code est calculé par
 * l'application de l'utilisateur à partir du secret partagé. Le refus est
 * explicite plutôt que silencieux, pour que le front n'affiche pas un bouton
 * « renvoyer le code » sur ce canal.
 */
export class MfaChallengeNotResendableError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor() {
    super(
      "Ce canal n'envoie pas de code : lisez-le dans votre application d'authentification.",
      { code: 'MFA_CHALLENGE_NOT_RESENDABLE' },
    );
  }
}

/**
 * Le `credential` d'un facteur a été demandé sous une forme que son canal ne
 * porte pas — une destination sur du TOTP, un secret sur de l'email ou du SMS.
 *
 * `UNEXPECTED` et non une erreur d'entrée : aucun appelant légitime ne peut la
 * déclencher, elle signale un bug. C'est justement son intérêt — le champ
 * unifié contient tantôt une adresse en clair, tantôt un secret chiffré, et
 * confondre les deux publierait le second ou déchiffrerait la première. Mieux
 * vaut une 500 tracée qu'une confusion silencieuse.
 */
export class MfaCredentialMismatchError extends IamError {
  readonly kind = IamErrorKind.UNEXPECTED;
  constructor(method: MfaMethodType, expected: string) {
    super(`Le canal ${method} ne porte pas ${expected}.`);
  }
}

/** Opération qui suppose un facteur actif alors que le compte n'en a aucun. */
export class NoActiveMfaMethodError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;
  constructor() {
    super(
      "Aucune méthode de double authentification n'est active sur ce compte.",
      {
        code: 'MFA_NOT_ENABLED',
      },
    );
  }
}

/**
 * `POST /auth/mfa/enable` appelé sans enrôlement en cours. Le body ne porte
 * pas de canal : c'est l'enrôlement en attente qui le désigne, et il n'y en a
 * pas.
 */
export class NoPendingMfaEnrollmentError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;
  constructor() {
    super(
      'Aucun enrôlement en cours — appelez POST /auth/mfa/enroll au préalable.',
      { code: 'MFA_ENROLLMENT_NOT_STARTED' },
    );
  }
}
