import { AccountStatus } from '../enums/account-status.enum';
import {
  AccountClosedError,
  AccountSuspendedError,
  EmailNotVerifiedError,
} from '../errors/iam.errors';

/**
 * Le compte tel qu'IAM a besoin de le connaître pour authentifier : un
 * identifiant, une adresse, son état de vérification, son état de compte, un
 * rôle.
 *
 * Ce n'est pas l'agrégat User — c'est la traduction de User dans le langage
 * d'IAM, construite par la couche anti-corruption (cf. AccountGateway). En
 * particulier, le hash du mot de passe n'y figure pas : IAM demande à Users de
 * vérifier un mot de passe, il ne le vérifie jamais lui-même.
 */
export class AuthAccount {
  constructor(
    readonly accountId: number,
    readonly email: string,
    readonly emailVerified: boolean,
    readonly hasPassword: boolean,
    readonly status: AccountStatus = AccountStatus.ACTIVE,
    readonly role?: string,
  ) {}

  /**
   * Invariant d'ouverture de session : adresse confirmée, et compte ni suspendu
   * ni clôturé — sans quoi une sanction serait contournable en se reconnectant
   * pour obtenir un JWT tout neuf.
   *
   * À n'appeler qu'APRÈS vérification du mot de passe : ces erreurs sont plus
   * bavardes que « identifiants invalides », et les lever plus tôt donnerait à
   * qui connaît une adresse un moyen de sonder l'état du compte associé.
   */
  ensureCanSignIn(): void {
    if (!this.emailVerified) {
      throw new EmailNotVerifiedError();
    }

    this.ensureNotSanctioned();
  }

  /**
   * Le sous-ensemble de `ensureCanSignIn` qui s'applique aux parcours où
   * l'adresse est justement en train d'être confirmée (OTP d'inscription) : on
   * n'exige pas `emailVerified`, mais un compte sanctionné ne repart pas avec
   * des tokens pour autant.
   */
  ensureNotSanctioned(): void {
    if (this.status === AccountStatus.SUSPENDED) {
      throw new AccountSuspendedError();
    }

    if (this.status === AccountStatus.CLOSED) {
      throw new AccountClosedError();
    }
  }
}
