import { IamError, IamErrorKind } from './iam.error';

/**
 * Le compte visé n'existe pas.
 *
 * Levée par les use cases qui chargent un compte avant d'agir dessus. Les
 * contrôleurs jetaient chacun leur `NotFoundException('Utilisateur
 * introuvable.')` — le message est repris mot pour mot, et `IamErrorFilter`
 * rend le même 404, avec un `code` en plus.
 */
export class UtilisateurIntrouvableError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;

  constructor() {
    super('Utilisateur introuvable.', { code: 'UTILISATEUR_INTROUVABLE' });
  }
}

/**
 * L'appelant n'a pas le droit d'agir sur ce compte.
 *
 * Le rôle est **relu en base** par les use cases concernés plutôt que pris
 * dans le token : un rôle rétrogradé entre l'émission du token et l'appel doit
 * s'appliquer immédiatement. C'est la défense en profondeur qui double les
 * décorateurs de permission, et elle appartient au use case — un worker ou un
 * job qui rejouerait la même action doit être soumis à la même règle.
 */
export class AccesCompteRefuseError extends IamError {
  readonly kind = IamErrorKind.FORBIDDEN;

  constructor(message = 'Accès refusé.') {
    super(message, { code: 'ACCES_COMPTE_REFUSE' });
  }
}

/**
 * Le mot de passe de confirmation ne correspond pas.
 *
 * Le `code` est ce que l'intercepteur du front lit pour distinguer ce refus
 * d'une session expirée : sans lui, il croit à un token périmé, le rafraîchit
 * et rejoue la suppression. Il est donc conservé à l'identique —
 * `INVALID_PASSWORD` — malgré le vocabulaire français du reste.
 */
export class MotDePasseIncorrectError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;

  constructor() {
    super('Mot de passe incorrect.', { code: 'INVALID_PASSWORD' });
  }
}

/**
 * Le compte n'a pas de mot de passe à confirmer — inscription par fournisseur
 * social, par exemple. La suppression self-service ne peut pas s'appuyer sur
 * une preuve qui n'existe pas.
 */
export class ConfirmationParMotDePasseImpossibleError extends IamError {
  readonly kind = IamErrorKind.UNAUTHENTICATED;

  constructor() {
    super('Confirmation impossible.', {
      code: 'CONFIRMATION_IMPOSSIBLE',
    });
  }
}
