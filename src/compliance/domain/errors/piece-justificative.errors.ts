import {
  LIBELLE_PIECE,
  TypePieceJustificative,
} from 'src/compliance/domain/enums/type-piece-justificative.enum';
import { ComplianceError, ComplianceErrorKind } from './compliance.error';

/**
 * Cette pièce n'appartient pas à ce dossier — ou n'existe pas.
 *
 * Les deux cas rendent le même message, délibérément : distinguer
 * « introuvable » de « appartient à une autre société » confirmerait
 * l'existence d'un identifiant à qui n'y a pas droit. Même choix que
 * `GetProfilPMUseCase`, qui répond « introuvable » à qui n'est pas le
 * titulaire.
 */
export class PieceJustificativeIntrouvableError extends ComplianceError {
  readonly kind = ComplianceErrorKind.NOT_FOUND;

  constructor(readonly pieceId: string) {
    super('Cette pièce justificative est introuvable.', {
      code: 'PIECE_JUSTIFICATIVE_INTROUVABLE',
      details: { pieceId },
    });
  }
}

/**
 * Une pièce d'identité de bénéficiaire a été déposée sans dire lequel — ou une
 * pièce de la société avec un bénéficiaire.
 *
 * Le cahier des charges exige « une pièce d'identité pour chacun de ces
 * bénéficiaires » : sans le désigner, la pièce ne documente personne et ne peut
 * compter pour aucun. À l'inverse, rattacher un KBIS à un bénéficiaire ferait
 * exister deux extraits pour une même société, sans qu'on sache lequel fait
 * foi.
 */
export class BeneficiaireDeLaPieceIncoherentError extends ComplianceError {
  readonly kind = ComplianceErrorKind.INVALID_INPUT;

  constructor(
    readonly type: TypePieceJustificative,
    readonly attendu: boolean,
  ) {
    super(
      attendu
        ? `Une ${LIBELLE_PIECE[type]} doit désigner le bénéficiaire effectif qu'elle documente.`
        : `Une ${LIBELLE_PIECE[type]} documente la société, pas un bénéficiaire effectif en particulier.`,
      {
        code: 'BENEFICIAIRE_DE_LA_PIECE_INCOHERENT',
        details: { type, beneficiaireAttendu: attendu },
      },
    );
  }
}
