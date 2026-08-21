import { ReservationStatus } from '../enums/reservation-status.enum';
import {
  AnnulationReserveeAuTitulaireError,
  ReservationDejaConvertieError,
  ReservationNonAnnulableError,
  ReservationNonConvertibleError,
  ReservationNonExpirableError,
  ReservationNonValidableError,
} from '../errors/reservation.errors';
import { Rang } from '../value-objects/rang.vo';

/**
 * État complet de la réservation, tel qu'il transite depuis/vers la
 * persistance et tel qu'il est publié. Clés inchangées : les routes
 * `/reservations/*` rendent le même JSON qu'avant l'introduction de
 * l'agrégat.
 */
export interface ReservationSnapshot {
  id: string;
  projetId: string;
  utilisateurId: number;
  montantReserve: number;
  rangFile: number | null;
  statut: ReservationStatus;
  confirmationJusquAu: Date | null;
  investissementId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** État d'une réservation qui vient de naître, avant tout passage en base. */
export type ReservationNaissante = Omit<
  ReservationSnapshot,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * **Réservation (pré-investissement)** — l'agrégat racine du Core Domain
 * (§1, §3.1) : un engagement financier verrouillé sur un projet ANNONCÉ mais
 * pas encore PUBLIÉ, avec un rang dans la file d'attente et une conversion
 * prioritaire à l'ouverture de la collecte (§4.5 du cahier des charges).
 *
 * Cycle de vie :
 *
 * ```text
 * EN_ATTENTE ──valider()──▶ VALIDEE
 *     │                        │
 *     ├──convertir()──▶ CONVERTIE ◀──convertir()
 *     ├──annuler*()──▶ ANNULEE_USER / ANNULEE_ADMIN ◀──annuler*()
 *     └──expirer()───▶ EXPIRE
 * ```
 *
 * Invariants protégés ici, et nulle part ailleurs :
 *
 * - une réservation convertie est immuable — elle est devenue un
 *   investissement, l'annuler ou la reconvertir est un non-sens métier ;
 * - seuls `EN_ATTENTE` et `VALIDEE` sont annulables (RG-RES : l'annulation
 *   libère le rang et les fonds tant que la conversion n'a pas eu lieu) ;
 * - l'annulation par l'investisseur est réservée au titulaire — la variante
 *   admin est un comportement distinct, pas un drapeau (§38.4 : deux
 *   intentions, deux méthodes) ;
 * - seule une réservation `EN_ATTENTE` peut expirer — l'expiration sanctionne
 *   une confirmation qui n'est jamais venue, pas une réservation validée.
 *
 * Ces règles vivaient dans `CancelReservationUseCase` (listes d'états et
 * affectation `reservation.statut = …` côté application) ; le back-office en
 * possédait une copie divergente. Les transitions ci-dessous sont désormais
 * les seules manières de changer l'état d'une réservation.
 *
 * Le montant et le rang, eux, se décident à la naissance : bornes de ticket et
 * plafond appartiennent à `ReservationFactory` et `ReservationCapacity` (§6) —
 * une fois née, une réservation ne change ni de montant ni de rang.
 */
export class Reservation {
  private _statut: ReservationStatus;
  private _investissementId: string | null;
  private _confirmationJusquAu: Date | null;
  private readonly _entete: Omit<
    ReservationSnapshot,
    'statut' | 'investissementId' | 'confirmationJusquAu'
  >;

  /** @internal Réservé à `ReservationFactory` et `ReservationOrmMapper`. */
  constructor(etat: ReservationSnapshot) {
    const { statut, investissementId, confirmationJusquAu, ...entete } = etat;
    this._statut = statut;
    this._investissementId = investissementId;
    this._confirmationJusquAu = confirmationJusquAu;
    this._entete = entete;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * L'investisseur retire son engagement. Réservée au titulaire ; la
   * réservation doit encore être annulable (`EN_ATTENTE` ou `VALIDEE`).
   */
  annulerParInvestisseur(utilisateurId: number): void {
    if (this._entete.utilisateurId !== utilisateurId) {
      throw new AnnulationReserveeAuTitulaireError();
    }
    this.eprouverAnnulable();
    this._statut = ReservationStatus.ANNULEE_USER;
  }

  /**
   * Le back-office retire l'engagement (projet abandonné, demande support…).
   * Même fenêtre d'annulabilité que l'investisseur, mais un statut distinct :
   * l'audit et le reporting distinguent qui a annulé.
   */
  annulerParAdministrateur(): void {
    this.eprouverAnnulable();
    this._statut = ReservationStatus.ANNULEE_ADMIN;
  }

  /**
   * L'investisseur confirme son engagement dans la fenêtre demandée —
   * la réservation attend alors la conversion, plus une confirmation.
   */
  valider(): void {
    if (this._statut !== ReservationStatus.EN_ATTENTE) {
      throw new ReservationNonValidableError(this._statut);
    }
    this._statut = ReservationStatus.VALIDEE;
    this._confirmationJusquAu = null;
  }

  /**
   * Le différenciateur du produit (§1.2 du cahier des charges) : à l'ouverture
   * de la collecte, la réservation devient un investissement — en tête de
   * file, selon son rang. Le fait `ReservationConvertie` publié en aval est le
   * contrat du contexte `subscription` (§3.4) : lui seul connaît
   * l'investissement créé, la réservation n'en retient que l'identifiant.
   */
  convertir(investissementId: string): void {
    if (this._statut === ReservationStatus.CONVERTIE) {
      throw new ReservationDejaConvertieError();
    }
    if (
      this._statut !== ReservationStatus.EN_ATTENTE &&
      this._statut !== ReservationStatus.VALIDEE
    ) {
      throw new ReservationNonConvertibleError(this._statut);
    }
    this._statut = ReservationStatus.CONVERTIE;
    this._investissementId = investissementId;
  }

  /**
   * La fenêtre de confirmation s'est refermée sans réponse : la réservation
   * expire et libère son rang. Seule une `EN_ATTENTE` peut expirer.
   */
  expirer(): void {
    if (this._statut !== ReservationStatus.EN_ATTENTE) {
      throw new ReservationNonExpirableError(this._statut);
    }
    this._statut = ReservationStatus.EXPIRE;
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  get id(): string {
    return this._entete.id;
  }

  get projetId(): string {
    return this._entete.projetId;
  }

  get utilisateurId(): number {
    return this._entete.utilisateurId;
  }

  get montantReserve(): number {
    return this._entete.montantReserve;
  }

  get rang(): Rang | null {
    return this._entete.rangFile === null
      ? null
      : Rang.de(this._entete.rangFile);
  }

  get statut(): ReservationStatus {
    return this._statut;
  }

  get investissementId(): string | null {
    return this._investissementId;
  }

  get estActive(): boolean {
    return (
      this._statut === ReservationStatus.EN_ATTENTE ||
      this._statut === ReservationStatus.VALIDEE
    );
  }

  /** L'état complet, pour la persistance et la présentation. */
  snapshot(): ReservationSnapshot {
    return {
      ...this._entete,
      statut: this._statut,
      confirmationJusquAu: this._confirmationJusquAu,
      investissementId: this._investissementId,
    };
  }

  // ── Règles internes ───────────────────────────────────────────────────────

  private eprouverAnnulable(): void {
    if (!this.estActive) {
      throw new ReservationNonAnnulableError(this._statut);
    }
  }
}
