import { EmailNotVerifiedError } from '../errors/iam.errors';

/**
 * Le compte tel qu'IAM a besoin de le connaître pour authentifier : un
 * identifiant, une adresse, son état de vérification, un rôle.
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
    readonly role?: string,
  ) {}

  /**
   * Invariant d'ouverture de session. Un compte dont l'adresse n'est pas
   * confirmée ne peut pas obtenir de tokens, même avec le bon mot de passe.
   */
  ensureCanSignIn(): void {
    if (!this.emailVerified) {
      throw new EmailNotVerifiedError();
    }
  }
}
