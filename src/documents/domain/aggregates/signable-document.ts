import { DocumentRelatedTo, DocumentType } from '../enums/document-type.enum';
import {
  CibleDeDocumentInvalideError,
  DocumentSansProjetError,
  InvestissementCibleManquantError,
  ProjetCibleManquantError,
  SeulesLesPhotosOntUnOrdreError,
  SeulesLesPhotosSontPrincipalesError,
} from '../errors';

/** État complet d'un document, tel qu'il transite depuis/vers la persistance. */
export interface SignableDocumentSnapshot {
  id: string;
  type: DocumentType;
  relatedTo: DocumentRelatedTo;
  userId: number | null;
  projectId: string | null;
  investmentId: string | null;
  originalName: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** URL de lecture rendue par le stockage objet. */
  path: string;
  isPublic: boolean;
  uploadedBy: number;
  /** Position d'affichage — seulement pour une photo de projet. */
  ordre: number | null;
  /** Image de couverture du projet — seulement pour une photo de projet. */
  estPrincipale: boolean;
  createdAt: Date;
}

/** Un document qui vient d'être téléversé, avant tout passage en base. */
export type SignableDocumentNaissant = Omit<
  SignableDocumentSnapshot,
  'id' | 'createdAt'
>;

/**
 * **Document signable** — une pièce déposée sur la plateforme : bulletin de
 * souscription, contrat de rachat, KIIS, IFU, pièce KYC, photo de projet.
 *
 * C'est l'agrégat racine du contexte (§6, §3.2). Il remplace une classe
 * `Document` de dix-sept champs publics sans un comportement (§7), dont
 * `DocumentController` était le gardien par défaut : c'est lui qui savait
 * qu'une image de couverture doit être une `PHOTO_PROJET`, qu'un document de
 * projet doit nommer son projet, qu'une cible autre que compte/projet/
 * investissement n'existe pas.
 *
 * **Signable, et pas seulement stockable.** Le nom vient de §3.2, et il dit
 * l'essentiel : ce contexte n'existe pas pour ranger des fichiers — il existe
 * parce que certains de ces fichiers engagent juridiquement celui qui les
 * signe. Les demandes de signature sont donc des entités *de cet agrégat*
 * ({@link Signature}), et non d'un contexte voisin comme le laissait croire
 * l'ancien dossier `src/signatures/`.
 *
 * Il ne connaît de ce à quoi il se rattache que des identifiants (§6.2) : ni
 * le projet, ni l'investissement, ni le compte propriétaire ne sont chargés
 * ici. Les règles d'accès qui en dépendent — qui peut lire quoi — restent dans
 * la présentation, où elles composent des permissions (§3.3), pas une règle du
 * domaine.
 */
export class SignableDocument {
  private _ordre: number | null;
  private _estPrincipale: boolean;
  private _isPublic: boolean;
  private readonly _entete: Omit<
    SignableDocumentSnapshot,
    'ordre' | 'estPrincipale' | 'isPublic'
  >;

  /** @internal Réservé à `televerser` et à `DocumentOrmMapper`. */
  constructor(etat: SignableDocumentSnapshot) {
    const { ordre, estPrincipale, isPublic, ...entete } = etat;
    this._ordre = ordre;
    this._estPrincipale = estPrincipale;
    this._isPublic = isPublic;
    this._entete = entete;
  }

  /**
   * Dépose une pièce. La cohérence entre la cible annoncée et l'identifiant
   * fourni est vérifiée ici — elle l'était dans `assertCanUpload`, mêlée aux
   * contrôles de permission, si bien qu'un appelant non-HTTP pouvait créer un
   * document de projet sans projet.
   */
  static televerser(depot: {
    type: DocumentType;
    relatedTo: DocumentRelatedTo;
    userId: number | null;
    projectId: string | null;
    investmentId: string | null;
    originalName: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    path: string;
    isPublic: boolean;
    uploadedBy: number;
    ordre: number | null;
    estPrincipale: boolean;
  }): SignableDocumentNaissant {
    switch (depot.relatedTo) {
      case DocumentRelatedTo.USER:
        break;
      case DocumentRelatedTo.PROJECT:
        if (!depot.projectId) throw new ProjetCibleManquantError();
        break;
      case DocumentRelatedTo.INVESTMENT:
        if (!depot.investmentId) throw new InvestissementCibleManquantError();
        break;
      default:
        throw new CibleDeDocumentInvalideError(String(depot.relatedTo));
    }

    return { ...depot };
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Désigne cette photo comme couverture de son projet.
   *
   * L'agrégat dit que *cette* photo peut l'être ; qu'elle soit la **seule** à
   * l'être porte sur toutes les photos du projet, et revient donc au
   * repository, qui décoiffe l'ancienne dans la même opération.
   */
  definirCommeImagePrincipale(): void {
    this.assertPhotoDeProjet(new SeulesLesPhotosSontPrincipalesError());
    this._estPrincipale = true;
  }

  /** Place cette photo à un rang donné dans la galerie de son projet. */
  placerEnPosition(ordre: number): void {
    this.assertPhotoDeProjet(new SeulesLesPhotosOntUnOrdreError());
    this._ordre = ordre;
  }

  private assertPhotoDeProjet(siMauvaisType: Error): void {
    if (this._entete.type !== DocumentType.PHOTO_PROJET) {
      throw siMauvaisType;
    }
    if (!this._entete.projectId) {
      throw new DocumentSansProjetError();
    }
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  /** La pièce est consultable sans authentification. */
  get estPublic(): boolean {
    return this._isPublic;
  }

  /** La pièce fait partie de la galerie d'un projet. */
  get estPhotoDeProjet(): boolean {
    return (
      this._entete.type === DocumentType.PHOTO_PROJET &&
      this._entete.projectId !== null
    );
  }

  get id(): string {
    return this._entete.id;
  }

  get type(): DocumentType {
    return this._entete.type;
  }

  get relatedTo(): DocumentRelatedTo {
    return this._entete.relatedTo;
  }

  get userId(): number | null {
    return this._entete.userId;
  }

  get projectId(): string | null {
    return this._entete.projectId;
  }

  get investmentId(): string | null {
    return this._entete.investmentId;
  }

  get originalName(): string {
    return this._entete.originalName;
  }

  /** La clé de l'objet dans le stockage — ce qu'il faut pour le supprimer. */
  get filename(): string {
    return this._entete.filename;
  }

  get mimeType(): string {
    return this._entete.mimeType;
  }

  get sizeBytes(): number {
    return this._entete.sizeBytes;
  }

  get path(): string {
    return this._entete.path;
  }

  get uploadedBy(): number {
    return this._entete.uploadedBy;
  }

  get ordre(): number | null {
    return this._ordre;
  }

  get estPrincipale(): boolean {
    return this._estPrincipale;
  }

  get createdAt(): Date {
    return this._entete.createdAt;
  }

  /** L'état complet, pour la persistance et la présentation. */
  snapshot(): SignableDocumentSnapshot {
    return {
      ...this._entete,
      ordre: this._ordre,
      estPrincipale: this._estPrincipale,
      isPublic: this._isPublic,
    };
  }
}
