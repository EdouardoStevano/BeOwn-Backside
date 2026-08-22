import { EcheanceStatus } from '../enums/echeance.enum';
import {
  EcheanceNonPayableError,
  EcheanceNonVerifiableError,
  EcheanceRegleeNonModifiableError,
  EcheanceRegleeNonSupprimableError,
  VerificationNonAnnulableError,
} from '../errors';
import { PrelevementForfaitaire } from '../value-objects/prelevement-forfaitaire.vo';

/** État complet d'une échéance, tel qu'il transite depuis/vers la persistance. */
export interface EcheanceSnapshot {
  id: string;
  investissementId: string;
  numero: number;
  datePrevue: Date;
  montantCapital: number;
  montantInterets: number;
  montantTotal: number;
  prelevementIR: number;
  prelevementCSG: number;
  statut: EcheanceStatus;
  payeLe: Date | null;
  statutChangeLe: Date | null;
  rappelJ7Envoye: boolean;
  rappelJ1Envoye: boolean;
}

/** Une échéance qui vient d'être générée, avant tout passage en base. */
export type EcheanceNaissante = Omit<EcheanceSnapshot, 'id'>;

/**
 * **Échéance (coupon)** — une ligne de l'échéancier de remboursement : à la
 * date prévue, l'émetteur verse à l'investisseur une part de capital et les
 * intérêts courus, nets de la retenue à la source.
 *
 * Entité interne de l'échéancier (§7) : elle a une identité stable mais ne vit
 * pas seule — un échéancier n'existe que rattaché à un investissement, et se
 * régénère entièrement quand celui-ci change de montant. Elle ne connaît de
 * l'investissement que son identifiant (§6.2).
 *
 * Le règlement se joue en deux temps, et c'est délibéré :
 *
 * - **ici**, `payer()` décide *si* l'échéance est réglable et *combien* elle
 *   verse — la fiscalité vit dans {@link PrelevementForfaitaire} ;
 * - **dans l'application**, le claim conditionnel en base (`WHERE statut IN
 *   (payables)`) rejoue cette même décision de façon atomique, pour qu'un
 *   retry concurrent du CRON ne puisse pas créditer deux fois.
 *
 * La seconde ne remplace pas la première : le verrou protège contre la
 * concurrence, l'entité protège la règle. Un `PAYE` qui repasserait au
 * paiement perdrait la trace fiscale de son premier règlement.

 */
export class Echeance {
  /**
   * Statuts depuis lesquels un règlement est légitime. `RETARD` est le statut
   * hérité que le CRON pose encore ; `RETARD_LEGER` et `RETARD_SIGNIFICATIF`
   * lui succèdent (J+1→J+30, J+31→J+90) et restent payables — un retard se
   * rattrape. `DEFAUT`, `PERTE_DEFINITIVE`, `IMPAYE`, `ANNULE` et `PAYE`, non.
   */
  static readonly STATUTS_PAYABLES: readonly EcheanceStatus[] = [
    EcheanceStatus.A_VENIR,
    EcheanceStatus.RETARD,
    EcheanceStatus.RETARD_LEGER,
    EcheanceStatus.RETARD_SIGNIFICATIF,
    EcheanceStatus.EN_ATTENTE_PAIEMENT,
  ];

  private _statut: EcheanceStatus;
  private _payeLe: Date | null;
  private _statutChangeLe: Date | null;
  private _prelevementIR: number;
  private _prelevementCSG: number;
  private _datePrevue: Date;
  private _montantCapital: number;
  private _montantInterets: number;
  private _montantTotal: number;
  private readonly _entete: Omit<
    EcheanceSnapshot,
    | 'statut'
    | 'payeLe'
    | 'statutChangeLe'
    | 'prelevementIR'
    | 'prelevementCSG'
    | 'datePrevue'
    | 'montantCapital'
    | 'montantInterets'
    | 'montantTotal'
  >;

  /** @internal Réservé à `EcheancierGenerator` et `EcheanceOrmMapper`. */
  constructor(etat: EcheanceSnapshot) {
    const {
      statut,
      payeLe,
      statutChangeLe,
      prelevementIR,
      prelevementCSG,
      datePrevue,
      montantCapital,
      montantInterets,
      montantTotal,
      ...entete
    } = etat;
    this._statut = statut;
    this._payeLe = payeLe;
    this._statutChangeLe = statutChangeLe;
    this._prelevementIR = prelevementIR;
    this._prelevementCSG = prelevementCSG;
    this._datePrevue = datePrevue;
    this._montantCapital = montantCapital;
    this._montantInterets = montantInterets;
    this._montantTotal = montantTotal;
    this._entete = entete;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Règle l'échéance : applique le PFU sur les intérêts et fige la trace
   * fiscale. Rend le détail du prélèvement — l'application s'en sert pour
   * créditer l'investisseur du net et les wallets séquestres IR et CSG.
   */
  payer(maintenant: Date = new Date()): PrelevementForfaitaire {
    if (!this.estPayable) {
      throw new EcheanceNonPayableError(this._statut);
    }

    const prelevement = PrelevementForfaitaire.surEcheance(
      this._montantInterets,
      this._montantTotal,
    );

    this._statut = EcheanceStatus.PAYE;
    this._payeLe = maintenant;
    this._statutChangeLe = maintenant;
    this._prelevementIR = prelevement.prelevementIR;
    this._prelevementCSG = prelevement.prelevementCSG;

    return prelevement;
  }

  /**
   * **Vérifier** — la finance a contrôlé l'échéance : elle passe de `A_VENIR` à
   * `EN_ATTENTE_PAIEMENT`, ce qui autorise le CRON quotidien à la régler à sa
   * date sans nouvelle intervention humaine.
   *
   * C'est le geste qui engage l'argent. Il vivait dans un `update` de colonne
   * au milieu d'un contrôleur d'administration, sans qu'aucun code ne dise
   * qu'on ne vérifie qu'une échéance encore à venir.
   */
  verifier(maintenant: Date = new Date()): void {
    if (this._statut !== EcheanceStatus.A_VENIR) {
      throw new EcheanceNonVerifiableError(this._statut);
    }

    this._statut = EcheanceStatus.EN_ATTENTE_PAIEMENT;
    this._statutChangeLe = maintenant;
  }

  /** La finance revient sur sa vérification, tant que le CRON n'a pas payé. */
  annulerVerification(maintenant: Date = new Date()): void {
    if (this._statut !== EcheanceStatus.EN_ATTENTE_PAIEMENT) {
      throw new VerificationNonAnnulableError(this._statut);
    }

    this._statut = EcheanceStatus.A_VENIR;
    this._statutChangeLe = maintenant;
  }

  /**
   * Corrige la date et les montants d'une échéance à venir.
   *
   * **Le total se dérive, il ne se fournit pas** : c'est l'invariant que la
   * correction manuelle menaçait le plus, et le contrôleur le recalculait à la
   * main, en trois lignes, seulement quand l'un des deux montants changeait.
   */
  corriger(correction: {
    datePrevue?: Date;
    montantCapital?: number;
    montantInterets?: number;
    statut?: EcheanceStatus;
  }): void {
    this.assertNonReglee(new EcheanceRegleeNonModifiableError());

    if (correction.datePrevue) this._datePrevue = correction.datePrevue;
    if (correction.montantCapital !== undefined) {
      this._montantCapital = correction.montantCapital;
    }
    if (correction.montantInterets !== undefined) {
      this._montantInterets = correction.montantInterets;
    }
    if (correction.statut) this._statut = correction.statut;

    this._montantTotal = this._montantCapital + this._montantInterets;
  }

  /** Éprouve la suppression sans la jouer : c'est le repository qui efface. */
  assertSupprimable(): void {
    this.assertNonReglee(new EcheanceRegleeNonSupprimableError());
  }

  private assertNonReglee(siReglee: Error): void {
    if (this.estReglee) throw siReglee;
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  get estPayable(): boolean {
    return Echeance.STATUTS_PAYABLES.includes(this._statut);
  }

  /** Le coupon a été versé : plus rien ne se corrige ni ne s'efface. */
  get estReglee(): boolean {
    return this._statut === EcheanceStatus.PAYE;
  }

  /** L'échéance attend encore sa vérification par la finance. */
  get estAVenir(): boolean {
    return this._statut === EcheanceStatus.A_VENIR;
  }

  get id(): string {
    return this._entete.id;
  }

  get investissementId(): string {
    return this._entete.investissementId;
  }

  get numero(): number {
    return this._entete.numero;
  }

  get datePrevue(): Date {
    return this._datePrevue;
  }

  get montantCapital(): number {
    return this._montantCapital;
  }

  get montantInterets(): number {
    return this._montantInterets;
  }

  get montantTotal(): number {
    return this._montantTotal;
  }

  get prelevementIR(): number {
    return this._prelevementIR;
  }

  get prelevementCSG(): number {
    return this._prelevementCSG;
  }

  get statut(): EcheanceStatus {
    return this._statut;
  }

  get payeLe(): Date | null {
    return this._payeLe;
  }

  get statutChangeLe(): Date | null {
    return this._statutChangeLe;
  }

  get rappelJ7Envoye(): boolean {
    return this._entete.rappelJ7Envoye;
  }

  get rappelJ1Envoye(): boolean {
    return this._entete.rappelJ1Envoye;
  }

  /** L'état complet, pour la persistance et la présentation. */
  snapshot(): EcheanceSnapshot {
    return {
      ...this._entete,
      datePrevue: this._datePrevue,
      montantCapital: this._montantCapital,
      montantInterets: this._montantInterets,
      montantTotal: this._montantTotal,
      statut: this._statut,
      payeLe: this._payeLe,
      statutChangeLe: this._statutChangeLe,
      prelevementIR: this._prelevementIR,
      prelevementCSG: this._prelevementCSG,
    };
  }
}
