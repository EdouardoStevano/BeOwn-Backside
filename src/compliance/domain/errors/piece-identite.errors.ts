import {
  LIBELLE_PIECE_IDENTITE,
  TypePieceIdentite,
} from 'src/compliance/domain/enums/type-piece-identite.enum';
import { ComplianceError, ComplianceErrorKind } from './compliance.error';

/**
 * Une pièce d'identité a été déposée sans son verso — ou un passeport avec un
 * dos qu'il n'a pas.
 *
 * Sur une carte nationale d'identité, la date d'expiration et la bande MRZ sont
 * au dos : accepter le seul recto reviendrait à valider une identité sans
 * pouvoir dire si la pièce est encore valide. Le régime protecteur veut qu'on ne
 * le présume pas — même raison que `PieceJustificative.estPerimee`, qui tient
 * pour périmée une pièce datée dont la date d'émission manque.
 *
 * **Elle est la seule dans ce cas.** Passeport, permis de conduire et titre de
 * séjour se prouvent d'une seule page ; leur réclamer un dos n'ajouterait aucune
 * garantie et les rendrait plus difficiles à déposer.
 */
export class VersoDeLaPieceIdentiteIncoherentError extends ComplianceError {
  readonly kind = ComplianceErrorKind.INVALID_INPUT;

  constructor(
    readonly type: TypePieceIdentite,
    readonly attendu: boolean,
  ) {
    super(
      attendu
        ? `Une ${LIBELLE_PIECE_IDENTITE[type]} se dépose recto et verso : la date d'expiration est au dos.`
        : `Un ${LIBELLE_PIECE_IDENTITE[type]} se dépose en une seule page — aucun verso n'est attendu.`,
      {
        code: 'VERSO_DE_LA_PIECE_IDENTITE_INCOHERENT',
        details: { type, versoAttendu: attendu },
      },
    );
  }
}

/**
 * Un dépôt manuel a été tenté sur un dossier dont l'identité est déjà vérifiée.
 *
 * **Le dépôt manuel est un recours, pas un second chemin.** Il n'existe que
 * parce que le fournisseur n'a pas su décider ; sur un dossier qu'il a validé,
 * il rouvrirait une question tranchée et créerait précisément les deux sources
 * d'un même fait que le cahier des charges refuse.
 *
 * Un dossier validé mais **périmé** n'est pas concerné : sa validité ne prouve
 * plus rien, et le titulaire doit pouvoir la refaire établir. C'est
 * `peutOperer()` qui fait la différence, et non le seul statut.
 */
export class IdentiteDejaVerifieeError extends ComplianceError {
  readonly kind = ComplianceErrorKind.CONFLICT;

  constructor() {
    super(
      "Votre identité est déjà vérifiée : il n'y a pas de revue manuelle à demander.",
      { code: 'IDENTITE_DEJA_VERIFIEE' },
    );
  }
}

/**
 * Un dépôt de pièce d'identité a visé le dossier d'une société.
 *
 * Une société n'a pas d'identité à vérifier : elle a un KYB — ses justificatifs
 * — et un représentant légal dont l'identité vaut pour toutes ses sociétés.
 * C'est l'exact pendant de `KybNeConcernePasUnePersonnePhysiqueError`, et les
 * deux ensemble ferment l'invariant dans les deux sens.
 */
export class PieceIdentiteNeConcernePasUneSocieteError extends ComplianceError {
  readonly kind = ComplianceErrorKind.CONFLICT;

  constructor() {
    super(
      "Une société n'a pas d'identité à vérifier : déposez les justificatifs de son dossier KYB, et la pièce d'identité sur le dossier du représentant légal.",
      { code: 'PIECE_IDENTITE_HORS_SUJET_POUR_UNE_SOCIETE' },
    );
  }
}
