import { IamError, IamErrorKind } from './iam.error';

/**
 * Erreurs du rattachement à un conseiller en gestion de patrimoine.
 *
 * Le contrôleur les levait lui-même en `ForbiddenException` /
 * `NotFoundException` — la présentation décidait donc de la règle *et* de son
 * statut. Les statuts rendus ici sont exactement ceux qu'il rendait : ce
 * déplacement ne change aucune réponse.
 */

/** Route réservée au rôle CGP, appelée par un autre rôle. */
export class AccesReserveAuCgpError extends IamError {
  readonly kind = IamErrorKind.FORBIDDEN;

  constructor() {
    super('Accès réservé aux CGP/Distributeurs.', {
      code: 'ACCES_RESERVE_AU_CGP',
    });
  }
}

/** Le code saisi ne correspond à aucun conseiller. */
export class CodeParrainageInconnuError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;

  constructor() {
    super('Code de parrainage invalide ou expiré.', {
      code: 'CODE_PARRAINAGE_INCONNU',
    });
  }
}

/** Le code saisi n'a pas la forme d'un code de parrainage. */
export class CodeParrainageMalFormeError extends IamError {
  readonly kind = IamErrorKind.NOT_FOUND;

  constructor(raw: string) {
    // Même message et même statut qu'un code inconnu, délibérément : distinguer
    // « mal formé » de « inexistant » dirait à un inconnu quels codes ont la
    // bonne tête, et transformerait la route en oracle de format.
    super('Code de parrainage invalide ou expiré.', {
      code: 'CODE_PARRAINAGE_INCONNU',
      details: { saisie: raw.slice(0, 32) },
    });
  }
}

/**
 * Le titulaire est déjà rattaché à un conseiller.
 *
 * `FORBIDDEN` et non `CONFLICT` : c'est le statut que le contrôleur rendait, et
 * le front s'aligne dessus. Un 409 décrirait mieux la situation — à changer le
 * jour où le front pourra suivre.
 */
export class DejaRattacheAUnCgpError extends IamError {
  readonly kind = IamErrorKind.FORBIDDEN;

  constructor() {
    super('Vous êtes déjà lié à un CGP.', {
      code: 'DEJA_RATTACHE_A_UN_CGP',
    });
  }
}

/** Un compte ne peut pas être son propre conseiller. */
export class RattachementASoiMemeError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;

  constructor() {
    super('Un compte ne peut pas être son propre CGP.', {
      code: 'RATTACHEMENT_A_SOI_MEME',
    });
  }
}
