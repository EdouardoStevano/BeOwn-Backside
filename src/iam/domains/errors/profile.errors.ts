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
