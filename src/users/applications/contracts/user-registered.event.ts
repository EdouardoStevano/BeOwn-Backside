/**
 * Événement publié par Users quand un compte vient d'être créé.
 *
 * Il fait partie du contrat publié, au même titre que USER_ACCOUNT_SERVICE :
 * c'est une vue plate, pas l'agrégat. Users ne sait pas qui l'écoute — c'est
 * ce qui permet à IAM d'y accrocher l'envoi du code d'inscription sans que
 * Users ait à connaître IAM.
 */
export class UserRegisteredEvent {
  constructor(
    public readonly userId: number,
    public readonly email: string,
    public readonly firstname: string,
  ) {}
}
