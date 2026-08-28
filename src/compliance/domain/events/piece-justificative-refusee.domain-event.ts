import { TypePieceJustificative } from '../enums/type-piece-justificative.enum';

/**
 * Une pièce justificative vient d'être refusée à l'instruction.
 *
 * Le cahier des charges enchaîne deux conséquences : *« l'utilisateur sera
 * notifié par mail et pourra modifier lui-même les documents refusés »*. La
 * seconde est déjà servie par la route de dépôt, qui remplace la pièce ; la
 * première est ce que cet événement déclenche, sans que le domaine sache qui y
 * réagit ni comment (§12).
 *
 * Il transporte **le motif**, contrairement aux autres événements de ce
 * contexte qui ne portent qu'un identifiant. C'est délibéré : le message envoyé
 * au titulaire est le motif, et le faire relire au destinataire l'obligerait à
 * rouvrir un dossier auquel il n'a pas de raison d'accéder — l'abonné est un
 * service de notification, pas un lecteur de conformité.
 */
export class PieceJustificativeRefuseeDomainEvent {
  constructor(
    /** Le compte à prévenir — celui qui a déclaré la société. */
    public readonly utilisateurId: number,
    public readonly societeId: string,
    public readonly pieceId: string,
    public readonly type: TypePieceJustificative,
    public readonly motif: string,
  ) {}
}
