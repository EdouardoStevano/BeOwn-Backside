import { IamError, IamErrorKind, IamErrorOptions } from './iam.error';

/**
 * Contrat d'erreur « statut de compte », partagé entre le contrôle par requête
 * (AccountStatusGuard) et les use cases qui délivrent des tokens (connexion,
 * vérification de l'OTP d'inscription).
 *
 * Ces codes/messages vivaient dans `common/auth/account-status.errors.ts` ;
 * ils décrivent l'état d'un compte, donc du vocabulaire IAM. Le guard les
 * importe désormais d'ici — il dépend déjà du contexte IAM pour les tokens.
 */

/**
 * Code d'erreur stable consommé par le front — email pas encore vérifié à la
 * connexion, l'utilisateur doit saisir/redemander son OTP d'inscription.
 * Remplace EMAIL_NOT_VERIFIED (V2-T1) : le message reste inchangé pour que le
 * front existant, qui matche encore sur le texte du message, continue de
 * fonctionner tel quel jusqu'à sa mise à jour (V2-T5) pour matcher sur `code`.
 */
export const OTP_REQUIRED_CODE = 'OTP_REQUIRED';
export const OTP_REQUIRED_MESSAGE =
  'Veuillez vérifier votre adresse email avant de vous connecter.';

/** Code d'erreur stable consommé par le front — compte suspendu par un administrateur. */
export const ACCOUNT_SUSPENDED_CODE = 'ACCOUNT_SUSPENDED';
/** Message affiché au front — contrat fixe, ne pas varier selon la cause du refus. */
export const ACCOUNT_SUSPENDED_MESSAGE =
  'Compte suspendu — contactez le support.';

/** Code d'erreur stable consommé par le front — compte clôturé ou supprimé. */
export const ACCOUNT_CLOSED_CODE = 'ACCOUNT_CLOSED';
export const ACCOUNT_CLOSED_MESSAGE = 'Compte clôturé — contactez le support.';

/** Email non vérifié : le compte existe mais ne peut pas encore ouvrir de session. */
export class EmailNotVerifiedError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor() {
    super(OTP_REQUIRED_MESSAGE, { code: OTP_REQUIRED_CODE });
  }
}

/** Compte suspendu par un administrateur — aucun nouveau token ne doit sortir. */
export class AccountSuspendedError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor() {
    super(ACCOUNT_SUSPENDED_MESSAGE, { code: ACCOUNT_SUSPENDED_CODE });
  }
}

/** Compte clôturé ou supprimé — idem, la session ne doit jamais repartir. */
export class AccountClosedError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;
  constructor() {
    super(ACCOUNT_CLOSED_MESSAGE, { code: ACCOUNT_CLOSED_CODE });
  }
}

/** Compte introuvable. Le message par défaut correspond aux flux OTP. */
export class UserNotFoundError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;
  constructor(message = 'Utilisateur introuvable') {
    super(message);
  }
}

/** Règle métier de suppression violée (auto-suppression, cible administrateur…). */
export class AccountDeletionNotAllowedError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
}

/** Code stable du refus de suppression pour cause de dépendances actives. */
export const ACCOUNT_DELETION_BLOCKED_CODE = 'ACCOUNT_DELETION_BLOCKED';

/**
 * Suppression refusée : investissements en cours, solde à verser, etc. Les
 * bloqueurs sont transportés dans `details` — le front les affiche un par un.
 */
export class AccountDeletionBlockedError extends IamError {
  readonly kind = IamErrorKind.CONFLICT;
  constructor(blockers: unknown[], options: IamErrorOptions = {}) {
    super('Suppression de compte bloquée.', {
      ...options,
      code: ACCOUNT_DELETION_BLOCKED_CODE,
      details: { blockers },
    });
  }
}
