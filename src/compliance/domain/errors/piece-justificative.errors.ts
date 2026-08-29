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
 * Une pièce nominative a été déposée sans dire qui elle documente — ou une
 * pièce de la société avec un bénéficiaire.
 *
 * Deux pièces désignent une personne : le **DBE-S1** et la **pièce
 * d'identité**. Sans nommer le bénéficiaire, elles ne documentent personne et
 * ne peuvent compter pour aucun — un dossier de trois actionnaires passerait
 * pour complet avec le formulaire d'un seul.
 *
 * À l'inverse, le KBIS, les statuts et la liste des actionnaires décrivent
 * l'entreprise prise comme un tout. Rattacher l'un d'eux à un bénéficiaire
 * ferait exister autant d'extraits que de personnes déclarées, sans qu'on sache
 * lequel fait foi.
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

/**
 * Une pièce d'identité a été déposée sans son verso — ou un document sans dos
 * s'est vu accoler une seconde face.
 *
 * **Le verso n'est pas un supplément, c'est la moitié du document.** Sur une
 * carte d'identité, la date d'expiration, l'adresse et la bande MRZ sont au
 * dos : instruire sur le seul recto revient à accepter une pièce sans pouvoir
 * vérifier qu'elle est encore valide. Le régime protecteur veut qu'on ne le
 * présume pas — même raison que `PieceJustificative.estPerimee`, qui tient pour
 * périmée une pièce datée dont la date d'émission manque.
 *
 * Dans l'autre sens, un KBIS n'a pas de dos : lui en attacher un désignerait
 * des octets que personne n'instruirait et que rien ne réclamerait jamais.
 */
export class VersoDeLaPieceIncoherentError extends ComplianceError {
  readonly kind = ComplianceErrorKind.INVALID_INPUT;

  constructor(
    readonly type: TypePieceJustificative,
    readonly attendu: boolean,
  ) {
    super(
      attendu
        ? `Une ${LIBELLE_PIECE[type]} se dépose recto **et** verso : la date d'expiration est au dos.`
        : `Une ${LIBELLE_PIECE[type]} n'a qu'une face — aucun verso n'est attendu.`,
      {
        code: 'VERSO_DE_LA_PIECE_INCOHERENT',
        details: { type, versoAttendu: attendu },
      },
    );
  }
}

/**
 * Une pièce d'identité a été déposée sans dire quel document elle est — ou un
 * KBIS s'est vu attribuer une nature qu'il n'a pas.
 *
 * **« Pièce d'identité » ne désigne pas un document**, mais une famille de
 * quatre : carte d'identité, passeport, permis de conduire, titre de séjour.
 * Sans savoir lequel, le dossier ne peut pas dire s'il lui manque un verso —
 * trois d'entre eux portent au dos la date d'expiration, le quatrième porte
 * tout sur sa page de données. La nature n'est donc pas une étiquette
 * d'affichage : c'est ce dont dépend la règle de composition.
 *
 * Dans l'autre sens, un KBIS ou des statuts n'ont pas de nature à choisir : il
 * n'existe qu'une façon d'être un extrait d'immatriculation.
 */
export class NatureDeLaPieceIdentiteIncoherenteError extends ComplianceError {
  readonly kind = ComplianceErrorKind.INVALID_INPUT;

  constructor(
    readonly type: TypePieceJustificative,
    readonly attendue: boolean,
  ) {
    super(
      attendue
        ? `Une ${LIBELLE_PIECE[type]} doit dire de quel document il s'agit : carte d'identité, passeport, permis de conduire ou titre de séjour.`
        : `Une ${LIBELLE_PIECE[type]} n'est pas un document d'identité — sa nature n'a pas à être précisée.`,
      {
        code: 'NATURE_DE_LA_PIECE_IDENTITE_INCOHERENTE',
        details: { type, natureAttendue: attendue },
      },
    );
  }
}
