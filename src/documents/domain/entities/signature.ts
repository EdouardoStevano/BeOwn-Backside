import { SignatureStatus } from '../enums/signature-status.enum';
import {
  AnnulationReserveeAuSignataireError,
  SignatureNonModifiableError,
} from '../errors';

/** État complet d'une signature, tel qu'il transite depuis/vers la persistance. */
export interface SignatureSnapshot {
  id: string;
  /** Référence de la procédure chez le prestataire de signature. */
  youSignRequestId: string;
  youSignSignerId: string;
  youSignSigningUrl: string | null;
  documentId: string;
  /** L'investissement signé — nul tant qu'il n'existe pas encore. */
  investmentId: string | null;
  /** L'ordre de cession signé — nul pour une souscription primaire. */
  ordreId: string | null;
  nbFractions: number | null;
  /** Le compte qui signe. */
  userId: number;
  statut: SignatureStatus;
  expiresAt: Date;
  signedAt: Date | null;
  createdAt: Date;
}

/** Une demande de signature qui vient d'être ouverte, avant passage en base. */
export type SignatureNaissante = Omit<SignatureSnapshot, 'id' | 'createdAt'>;

/**
 * **Signature** — la demande faite à un investisseur d'apposer sa signature
 * électronique sur un document, et ce qu'il en advient.
 *
 * Entité interne de {@link SignableDocument} (§7) : elle a une identité stable
 * mais ne vit pas seule — on ne signe jamais « une signature », on signe un
 * document. Elle ne connaît de ce qu'elle engage que des identifiants (§6.2) :
 * l'investissement souscrit, ou l'ordre de cession racheté.
 *
 * **Son invariant tient en une phrase : une signature ne quitte `PENDING`
 * qu'une fois.** C'est ce qui empêche un webhook rejoué de resigner un contrat
 * déjà signé, ou d'écraser la date de signature qui fait foi. Cette règle
 * était recopiée dans **six** `if (statut !== PENDING)` répartis entre le
 * webhook YouSign, l'annulation d'initiation et le back-office — trois
 * contextes extérieurs, chacun posant ensuite `signature.statut = …` à la main.
 *
 * Le garde et le verrou restent complémentaires, comme pour l'échéance : le
 * verrou pessimiste que le webhook pose sur la ligne protège de la concurrence,
 * l'entité protège la règle.
 */
export class Signature {
  private _statut: SignatureStatus;
  private _signedAt: Date | null;
  private readonly _entete: Omit<SignatureSnapshot, 'statut' | 'signedAt'>;

  /** @internal Réservé à `demander` et à `SignatureOrmMapper`. */
  constructor(etat: SignatureSnapshot) {
    const { statut, signedAt, ...entete } = etat;
    this._statut = statut;
    this._signedAt = signedAt;
    this._entete = entete;
  }

  /**
   * Ouvre une demande de signature. Elle naît en attente, avec sa date
   * d'expiration — au-delà, le lien du prestataire ne vaut plus rien.
   */
  static demander(demande: {
    youSignRequestId: string;
    youSignSignerId: string;
    youSignSigningUrl: string | null;
    documentId: string;
    investmentId: string | null;
    ordreId: string | null;
    nbFractions: number | null;
    userId: number;
    expiresAt: Date;
  }): SignatureNaissante {
    return {
      ...demande,
      statut: SignatureStatus.PENDING,
      signedAt: null,
    };
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /** Le signataire a signé : la date est figée, et ne se rejoue pas. */
  signer(quand: Date = new Date()): void {
    this.assertEnAttente();
    this._statut = SignatureStatus.SIGNED;
    this._signedAt = quand;
  }

  /** Le signataire renonce avant d'avoir signé. Réservé à lui. */
  annuler(parUserId: number): void {
    if (parUserId !== this._entete.userId) {
      throw new AnnulationReserveeAuSignataireError();
    }
    this.assertEnAttente();
    this._statut = SignatureStatus.CANCELLED;
  }

  /** Le délai du prestataire est écoulé : la demande tombe. */
  expirer(): void {
    this.assertEnAttente();
    this._statut = SignatureStatus.EXPIRED;
  }

  private assertEnAttente(): void {
    if (!this.estEnAttente) {
      throw new SignatureNonModifiableError(this._statut);
    }
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  /**
   * La demande attend encore le signataire.
   *
   * Distincte des transitions à dessein : les appelants idempotents — un
   * webhook relivré, une annulation rejouée — veulent *sortir sans bruit*
   * plutôt que lever. Ils interrogent, puis agissent.
   */
  get estEnAttente(): boolean {
    return this._statut === SignatureStatus.PENDING;
  }

  get estSignee(): boolean {
    return this._statut === SignatureStatus.SIGNED;
  }

  /** La signature engage une cession, pas une souscription primaire. */
  get concerneUneCession(): boolean {
    return this._entete.ordreId !== null;
  }

  /** La demande a dépassé sa date limite, sans que rien ne l'ait encore actée. */
  estEchue(maintenant: Date = new Date()): boolean {
    return (
      this.estEnAttente &&
      this._entete.expiresAt.getTime() <= maintenant.getTime()
    );
  }

  get id(): string {
    return this._entete.id;
  }

  get youSignRequestId(): string {
    return this._entete.youSignRequestId;
  }

  get documentId(): string {
    return this._entete.documentId;
  }

  get investmentId(): string | null {
    return this._entete.investmentId;
  }

  get ordreId(): string | null {
    return this._entete.ordreId;
  }

  get nbFractions(): number | null {
    return this._entete.nbFractions;
  }

  get userId(): number {
    return this._entete.userId;
  }

  get statut(): SignatureStatus {
    return this._statut;
  }

  get expiresAt(): Date {
    return this._entete.expiresAt;
  }

  get signedAt(): Date | null {
    return this._signedAt;
  }

  /** L'état complet, pour la persistance et la présentation. */
  snapshot(): SignatureSnapshot {
    return {
      ...this._entete,
      statut: this._statut,
      signedAt: this._signedAt,
    };
  }
}
