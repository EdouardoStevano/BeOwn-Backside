import { IamError, IamErrorKind } from './iam.error';

/**
 * Le mot de passe proposé ne satisfait pas la politique du compte.
 *
 * Le message énumère la règle entière plutôt que celle qui a manqué : dire
 * « il manque un chiffre » guide la saisie suivante, mais renseigne aussi qui
 * teste des variantes sur ce que contient déjà la chaîne essayée.
 */
export class WeakPasswordError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor() {
    super(
      'Le mot de passe doit contenir au moins 8 caractères, dont une majuscule, une minuscule et un chiffre.',
      { code: 'WEAK_PASSWORD' },
    );
  }
}

/**
 * Adresse email vide, trop longue ou mal formée.
 *
 * Le message ne reprend jamais la valeur saisie : cet endpoint est public, et
 * la réponse finit dans les logs comme dans l'historique du navigateur.
 */
export class InvalidEmailError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(reason: string) {
    super(`L'adresse email ${reason}`, { code: 'INVALID_EMAIL' });
  }
}

/** Prénom ou nom vide, trop court ou trop long. */
export class InvalidPersonNameError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;
  constructor(field: string, reason: string) {
    super(`${field} ${reason}`, {
      code: 'INVALID_PERSON_NAME',
      details: { field },
    });
  }
}

/**
 * Numéro de téléphone vide, trop court, trop long ou non numérique.
 *
 * Le numéro était éprouvé côté Profiles, tant qu'il vivait sur le dossier
 * investisseur. Il appartient désormais au compte, et sa règle avec lui — même
 * bornes, même message, `field: 'telephone'` pour que le front surligne
 * l'entrée fautive.
 */
export class InvalidTelephoneError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;

  constructor(reason: string) {
    super(`Le numéro de téléphone ${reason}`, {
      code: 'INVALID_TELEPHONE',
      details: { field: 'telephone' },
    });
  }
}
