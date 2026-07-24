/**
 * Codes et messages d'erreur liés à l'état du compte.
 *
 * Extraits dans un fichier sans aucune dépendance parce qu'ils sont un contrat
 * avec le front et qu'ils sont produits depuis deux endroits très différents :
 * AccountStatusGuard (contrôle par requête, infrastructure) et les erreurs de
 * domaine d'IAM (refus à la connexion). Les dupliquer les ferait diverger.
 */

/**
 * Email pas encore vérifié à la connexion : l'utilisateur doit saisir ou
 * redemander son OTP d'inscription. Remplace EMAIL_NOT_VERIFIED (V2-T1) ; le
 * message reste inchangé pour que le front existant, qui matche encore sur le
 * texte, continue de fonctionner jusqu'à sa bascule sur `code`.
 */
export const OTP_REQUIRED_CODE = 'OTP_REQUIRED';
export const OTP_REQUIRED_MESSAGE =
  'Veuillez vérifier votre adresse email avant de vous connecter.';

/** Compte suspendu par un administrateur. */
export const ACCOUNT_SUSPENDED_CODE = 'ACCOUNT_SUSPENDED';
/** Message affiché au front — contrat fixe, ne pas varier selon la cause du refus. */
export const ACCOUNT_SUSPENDED_MESSAGE =
  'Compte suspendu — contactez le support.';

/** Compte clôturé ou supprimé. */
export const ACCOUNT_CLOSED_CODE = 'ACCOUNT_CLOSED';
export const ACCOUNT_CLOSED_MESSAGE = 'Compte clôturé — contactez le support.';
