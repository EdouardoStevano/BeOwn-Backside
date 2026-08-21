import { EcheanceStatus } from '../enums/investment-status.enum';
import { EcheanceNonPayableError } from '../errors/subscription.errors';
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
 * Entité interne de l'agrégat {@link Investment} (§7) : elle a une identité
 * stable mais ne vit pas seule — un échéancier n'existe que rattaché à un
 * investissement, et se régénère entièrement quand celui-ci change de montant.
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
 *
 * > À terme, cette entité et son agrégat `RepaymentSchedule` appartiennent au
 * > contexte `servicing` (M8, §3.2). Elle vit encore ici — écart temporaire
 * > déjà signalé par `SubscriptionModule`.
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
  private readonly _entete: Omit<
    EcheanceSnapshot,
    'statut' | 'payeLe' | 'statutChangeLe' | 'prelevementIR' | 'prelevementCSG'
  >;

  /** @internal Réservé à `EcheancierGenerator` et `InvestmentOrmMapper`. */
  constructor(etat: EcheanceSnapshot) {
    const {
      statut,
      payeLe,
      statutChangeLe,
      prelevementIR,
      prelevementCSG,
      ...entete
    } = etat;
    this._statut = statut;
    this._payeLe = payeLe;
    this._statutChangeLe = statutChangeLe;
    this._prelevementIR = prelevementIR;
    this._prelevementCSG = prelevementCSG;
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
      this._entete.montantInterets,
      this._entete.montantTotal,
    );

    this._statut = EcheanceStatus.PAYE;
    this._payeLe = maintenant;
    this._statutChangeLe = maintenant;
    this._prelevementIR = prelevement.prelevementIR;
    this._prelevementCSG = prelevement.prelevementCSG;

    return prelevement;
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  get estPayable(): boolean {
    return Echeance.STATUTS_PAYABLES.includes(this._statut);
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
    return this._entete.datePrevue;
  }

  get montantCapital(): number {
    return this._entete.montantCapital;
  }

  get montantInterets(): number {
    return this._entete.montantInterets;
  }

  get montantTotal(): number {
    return this._entete.montantTotal;
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
      statut: this._statut,
      payeLe: this._payeLe,
      statutChangeLe: this._statutChangeLe,
      prelevementIR: this._prelevementIR,
      prelevementCSG: this._prelevementCSG,
    };
  }
}
