import { UserStatus, UserType } from 'src/iam/domains/enums/user.enum';
import { IamError, IamErrorKind } from './iam.error';

/**
 * Statuts qu'un administrateur peut poser sur un compte.
 *
 * `CREE` et `EMAIL_VERIFIE` en sont absents : ce sont des étapes du cycle de
 * vie interne, posées par la vérification d'adresse. Les repositionner à la
 * main désynchroniserait le compte de son email — un compte remis en `CREE`
 * redemanderait un OTP d'inscription déjà consommé. `SUPPRIME` non plus : la
 * suppression a son propre chemin, qui lève les bloqueurs et anonymise.
 */
export const STATUTS_ADMINISTRABLES: readonly UserStatus[] = [
  UserStatus.ACTIF,
  UserStatus.SUSPENDU,
  UserStatus.CLOS,
];

/**
 * Statut refusé : hors énumération, ou hors de ce que l'administration décide.
 *
 * Le DTO d'administration déclarait `status?: string` avec un simple
 * `@IsString()` — la valeur n'était comparée à l'énumération nulle part, et
 * `PATCH /users/:id { "status": "banana" }` serait entré tel quel dans la
 * colonne. La règle vit ici pour valoir quel que soit le point d'entrée.
 */
export class InvalidUserStatusError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;

  constructor(statut: string) {
    super(
      `Statut de compte invalide : attendu ${STATUTS_ADMINISTRABLES.join(', ')}.`,
      { code: 'INVALID_USER_STATUS', details: { field: 'status', statut } },
    );
  }
}

/** Type d'investisseur refusé — seuls `PP` et `PM` existent. */
export class InvalidUserTypeError extends IamError {
  readonly kind = IamErrorKind.INVALID_INPUT;

  constructor(userType: string) {
    super(
      `Type de compte invalide : attendu ${Object.values(UserType).join(' ou ')}.`,
      { code: 'INVALID_USER_TYPE', details: { field: 'userType', userType } },
    );
  }
}
