import {
  TypePieceJustificative,
  VALIDITE_EN_MOIS,
} from '../enums/type-piece-justificative.enum';
import {
  DecisionPiece,
  DecisionPieceSnapshot,
} from '../value-objects/decision-piece.vo';
import {
  FichierDepose,
  FichierDeposeSnapshot,
} from '../value-objects/fichier-depose.vo';

/** Ce que la pièce ajoute à ses deux blocs : ses clés et ses dates. */
export interface EntetePiece {
  /** Identité propre, attribuée par la persistance. */
  id: string;
  type: TypePieceJustificative;
  /**
   * Le bénéficiaire effectif documenté — `null` pour les pièces de la société.
   *
   * C'est la seule chose qui distingue deux pièces de même type : il n'y a
   * qu'un KBIS par société, mais autant de pièces d'identité que de
   * bénéficiaires déclarés.
   */
  beneficiaireId: string | null;
  /**
   * Date à laquelle le document a été **émis**, pas déposé.
   *
   * `null` quand elle n'est pas exigée. Pour un KBIS elle l'est : c'est elle,
   * et non la date de dépôt, qui décide de la fraîcheur — redéposer un extrait
   * de janvier en juin ne le rajeunit pas.
   */
  dateEmission: Date | null;
  deposeeLe: Date;
}

/**
 * Le verso, à plat et préfixé.
 *
 * Préfixé plutôt que rangé dans un sous-objet : le snapshot est la forme de la
 * table, et `FichierDeposeSnapshot` occupe déjà les cinq clés nues pour le
 * recto. Cinq colonnes de plus, donc, sur la même ligne — recto et verso ne se
 * séparent pas, ils sont deux faces d'un seul document.
 */
export interface VersoSnapshot {
  versoNomOrigine: string | null;
  versoCleStockage: string | null;
  versoUrl: string | null;
  versoMimeType: string | null;
  versoTailleOctets: number | null;
}

export interface PieceJustificativeSnapshot
  extends
    EntetePiece,
    FichierDeposeSnapshot,
    VersoSnapshot,
    DecisionPieceSnapshot {}

/**
 * Un justificatif déposé à l'appui d'un dossier personne morale.
 *
 * **Une entité, pas un Value Object** : elle a une identité stable et une vie
 * propre — déposée, instruite, refusée, remplacée — et deux pièces d'identité
 * de bénéficiaires peuvent avoir exactement le même contenu sans être la même
 * pièce (§7).
 *
 * Deux blocs, chacun avec son invariant :
 *
 * | Bloc             | Sujet                                        |
 * | ---------------- | -------------------------------------------- |
 * | `FichierDepose`  | où sont les octets, et sont-ils lisibles      |
 * | `DecisionPiece`  | l'instruction, et le motif qui l'explique     |
 *
 * **Le recto et le verso sont deux `FichierDepose` pour une seule pièce.** Une
 * carte d'identité ne se prouve pas par sa seule face — la date d'expiration et
 * la bande MRZ sont au dos — mais elle ne se décide pas non plus face par face :
 * l'équipe conformité accepte ou refuse *un document d'identité*. D'où une
 * entité qui porte deux fichiers et **une** {@link DecisionPiece}, plutôt que
 * deux pièces à instruire séparément, ce qui aurait permis d'accepter un recto
 * et de refuser son verso.
 *
 * Le verso est `null` partout ailleurs : un KBIS n'a pas de dos. Quels types en
 * exigent un est dit par `PIECES_RECTO_VERSO`, et éprouvé au dépôt par
 * `DossierDePieces` — l'entité, elle, accepte ce qu'on lui donne, comme pour le
 * reste de ses invariants de composition (§6).
 *
 * Ce qui reste ici est ce qui n'appartient à aucun d'eux : ce que la pièce
 * **est** (son type, qui elle documente), quand elle a été émise, et la seule
 * règle qui croise les deux — {@link estPerimee}, qui confronte la date
 * d'émission à la durée de validité du type.
 *
 * Elle n'est atteignable qu'à travers {@link DossierDePieces}, sa racine : une
 * pièce isolée ne dit pas si le dossier tient, et c'est la seule question que
 * le métier pose (§6).
 */
export class PieceJustificative {
  private readonly _id: string;
  private readonly _type: TypePieceJustificative;
  private readonly _beneficiaireId: string | null;
  private _fichier: FichierDepose;
  private _verso: FichierDepose | null;
  private _dateEmission: Date | null;
  private _decision: DecisionPiece;
  private _deposeeLe: Date;

  /**
   * @internal Réservé à {@link DossierDePieces} et au mapper de persistance.
   *
   * Public faute de mieux : TypeScript n'a pas de classe amie. Y passer, c'est
   * se déclarer racine ou mapper, et prendre à sa charge les invariants que
   * l'une pose et que l'autre assume de ne pas rejouer.
   */
  constructor(etat: {
    entete: EntetePiece;
    fichier: FichierDepose;
    /** Le dos du document ; absent pour tout ce qui n'en a pas. */
    verso?: FichierDepose | null;
    decision: DecisionPiece;
  }) {
    this._id = etat.entete.id;
    this._type = etat.entete.type;
    this._beneficiaireId = etat.entete.beneficiaireId;
    this._dateEmission = etat.entete.dateEmission;
    this._deposeeLe = etat.entete.deposeeLe;
    this._fichier = etat.fichier;
    this._verso = etat.verso ?? null;
    this._decision = etat.decision;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Un nouveau fichier remplace celui-ci, et l'instruction repart de zéro.
   *
   * C'est ce que fait le titulaire qui corrige une pièce refusée. Le retour à
   * `EN_ATTENTE` n'est pas un détail : sans lui, une pièce corrigée resterait
   * marquée refusée et le dossier n'avancerait jamais.
   *
   * La pièce garde son identité — c'est le même justificatif dans le dossier,
   * pas un second. Ce qui change, ce sont les octets et le verdict.
   *
   * **Le verso est remplacé avec le recto, jamais conservé.** Redéposer une
   * carte d'identité, c'est en déposer une autre : garder l'ancien dos
   * accolerait le verso de la pièce périmée au recto de la nouvelle, et
   * l'instruction porterait sur un document qui n'existe pas.
   */
  remplacerPar(
    fichier: FichierDepose,
    verso: FichierDepose | null,
    dateEmission: Date | null,
    maintenant: Date,
  ): void {
    this._fichier = fichier;
    this._verso = verso;
    this._dateEmission = dateEmission;
    this._deposeeLe = maintenant;
    this._decision = DecisionPiece.enAttente();
  }

  accepter(le: Date): void {
    this._decision = this._decision.acceptee(le);
  }

  refuser(motif: string, le: Date): void {
    this._decision = this._decision.refusee(motif, le);
  }

  // ── Règles propres à la pièce ─────────────────────────────────────────────

  /**
   * La pièce a-t-elle dépassé sa durée de validité ?
   *
   * Seul un type daté peut l'être — aujourd'hui le KBIS, trois mois. Une pièce
   * sans durée de validité n'est jamais périmée, et une pièce datée sans date
   * d'émission **l'est** : on ne peut pas prouver sa fraîcheur, et le régime
   * protecteur veut qu'on ne la présume pas.
   *
   * @param maintenant injecté pour que la règle s'éprouve sans dépendre de
   *   l'horloge (§26).
   */
  estPerimee(maintenant: Date): boolean {
    const mois = VALIDITE_EN_MOIS[this._type];
    if (mois === undefined) return false;
    if (this._dateEmission === null) return true;

    const limite = new Date(this._dateEmission);
    limite.setMonth(limite.getMonth() + mois);
    return limite < maintenant;
  }

  /**
   * La pièce compte-t-elle pour la complétude du dossier ?
   *
   * Il faut qu'elle soit acceptée **et** encore fraîche : un KBIS accepté en
   * janvier ne prouve plus rien en juin, et le laisser compter rendrait le
   * dossier définitivement complet au premier passage.
   */
  estRecevable(maintenant: Date): boolean {
    return this._decision.estAcceptee() && !this.estPerimee(maintenant);
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get id(): string {
    return this._id;
  }
  get type(): TypePieceJustificative {
    return this._type;
  }
  get beneficiaireId(): string | null {
    return this._beneficiaireId;
  }
  /** Le recto — ou l'unique face, pour les pièces qui n'ont pas de dos. */
  get fichier(): FichierDepose {
    return this._fichier;
  }
  /** Le dos du document, `null` pour tout ce qui n'en a pas. */
  get verso(): FichierDepose | null {
    return this._verso;
  }
  get decision(): DecisionPiece {
    return this._decision;
  }
  get dateEmission(): Date | null {
    return this._dateEmission;
  }
  get deposeeLe(): Date {
    return this._deposeeLe;
  }

  /** Deux pièces documentent la même chose si type et bénéficiaire coïncident. */
  documenteLaMemeChoseQue(
    type: TypePieceJustificative,
    beneficiaireId: string | null,
  ): boolean {
    return this._type === type && this._beneficiaireId === beneficiaireId;
  }

  toSnapshot(): PieceJustificativeSnapshot {
    return {
      id: this._id,
      type: this._type,
      beneficiaireId: this._beneficiaireId,
      dateEmission: this._dateEmission,
      deposeeLe: this._deposeeLe,
      ...this._fichier.toSnapshot(),
      ...versoAPlat(this._verso),
      ...this._decision.toSnapshot(),
    };
  }
}

/**
 * Le verso rendu en cinq colonnes, ou cinq `null`.
 *
 * C'est ici, et seulement ici, que l'absence de dos devient des `null` : une
 * table est rectangulaire, le modèle ne l'est pas (§16 — même repli que
 * `ClassementPsfp.toSnapshot`). Aucun appelant n'a donc à demander un verso à
 * un KBIS pour s'entendre répondre cinq fois `null`.
 */
function versoAPlat(verso: FichierDepose | null): VersoSnapshot {
  if (verso === null) {
    return {
      versoNomOrigine: null,
      versoCleStockage: null,
      versoUrl: null,
      versoMimeType: null,
      versoTailleOctets: null,
    };
  }

  const face = verso.toSnapshot();
  return {
    versoNomOrigine: face.nomOrigine,
    versoCleStockage: face.cleStockage,
    versoUrl: face.url,
    versoMimeType: face.mimeType,
    versoTailleOctets: face.tailleOctets,
  };
}
