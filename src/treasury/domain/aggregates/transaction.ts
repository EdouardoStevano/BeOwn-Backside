import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from '../enums/wallet.enum';
import { Money } from '../value-objects/money.vo';

/**
 * Clés que le bagage `metadata` porte et que le domaine sait nommer.
 *
 * Elles y étaient déjà, mais lues à la main par des `meta.userId as number`
 * disséminés dans le contrôleur et le use case — c'est-à-dire sans que rien ne
 * dise qu'elles existent, ni qu'un `transferId` conditionne un reversal. Les
 * nommer ici ne change pas la colonne : cela donne un nom aux faits qu'elle
 * transporte.
 */
export interface MetadonneesMouvement {
  /** Le titulaire concerné — le mouvement n'a pas de colonne pour lui. */
  userId?: number;
  /** Par quel rail le retrait est parti : `stripe_connect` ou `legacy_manuel`. */
  method?: string;
  connectedAccountId?: string;
  /** Le transfert plateforme → compte connecté, s'il a eu lieu. */
  transferId?: string;
  /** Le versement compte connecté → banque, s'il a été demandé explicitement. */
  payoutId?: string;
  ibanDestination?: string;
  /** Le solde a été rendu au titulaire : ce mouvement ne se rejoue plus. */
  recredited?: boolean;
  recreditReason?: string;
  recreditedAt?: string;
  [autre: string]: unknown;
}

/**
 * État complet du mouvement, tel qu'il transite depuis/vers la persistance.
 *
 * Des primitives à plat : `Money` ne franchit pas cette frontière, et les clés
 * sont exactement les colonnes de `transaction_paiement` — le JSON publié par
 * `GET /wallets/:id/transactions` est inchangé.
 */
export interface TransactionSnapshot {
  id: string;
  /**
   * Les **trois** colonnes de rattachement à un portefeuille, telles que la
   * table les porte.
   *
   * > ⚠️ `walletSource` et `walletId` sont deux colonnes distinctes —
   * > `"walletSource"` et `"wallet_source"` — créées ensemble par le schéma
   * > initial. Les parcours de dépôt et de retrait écrivent la seconde, le
   * > registre générique écrit la première, et `findByWallet` interroge les
   * > trois pour que la lecture retombe sur ses pieds. C'est un défaut de
   * > modèle, pas une subtilité : il appelle une migration de consolidation,
   * > qui déplace des écritures comptables et mérite donc son propre passage.
   * > L'agrégat le reproduit fidèlement plutôt que de le corriger en douce.
   */
  walletSource: string | null;
  walletId: string | null;
  walletDestination: string | null;
  montant: number;
  devise: string;
  type: TransactionType;
  referenceExterne: string | null;
  fournisseur: TransactionFournisseur;
  fournisseurRef: string | null;
  statut: TransactionStatus;
  investissementId: string | null;
  echeanceId: string | null;
  reservationId: string | null;
  projetId: string | null;
  idempotencyKey: string | null;
  fraisPsp: number;
  fraisPlateforme: number;
  metadata: MetadonneesMouvement | null;
  motifEchec: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Un mouvement qui vient d'être décidé, avant tout passage en base. */
export type TransactionNaissante = Omit<
  TransactionSnapshot,
  'id' | 'createdAt' | 'updatedAt'
>;

/** Les statuts dont un mouvement ne revient pas. */
const STATUTS_TERMINAUX: readonly TransactionStatus[] = [
  TransactionStatus.ECHOUE,
  TransactionStatus.REMBOURSE,
  TransactionStatus.ANNULE,
];

/**
 * **Transaction** — un mouvement de fonds au registre de la plateforme.
 *
 * Agrégat à part entière, et non une entité du portefeuille : un mouvement
 * relie **deux** portefeuilles, il ne peut donc vivre à l'intérieur d'aucun
 * des deux (§6.2). Il a de surcroît son propre cycle de vie, et sa clé
 * d'idempotence est le garde-fou contre le double-règlement de tous les
 * parcours financiers de l'application.
 *
 * C'était une classe à vingt champs publics et mutables, sans constructeur ni
 * méthode — un **Anemic Domain Model** au sens exact du §7. Ses conséquences
 * n'étaient pas théoriques :
 *
 * - **le statut se posait par affectation**, `tx.statut = REUSSI`, depuis le
 *   contrôleur du webhook. Rien n'empêchait de finaliser un retrait déjà
 *   recrédité, et c'est pourquoi chaque appelant reportait à la main la même
 *   liste de gardes — `statut === REUSSI || statut === ECHOUE ||
 *   meta.recredited === true` — recopiée en trois endroits, avec une variante
 *   à chaque fois ;
 * - **le mouvement ne portait ni `fournisseurRef` ni `walletId`**, alors que
 *   les colonnes existent et que les parcours de paiement les remplissent.
 *   `WalletOrmMapper.txToEntity` les laissait donc à `null` : tout mouvement
 *   enregistré par le port du registre perdait sa référence chez le
 *   fournisseur.
 *
 * Ce que les transitions ci-dessous garantissent, et qu'aucune affectation ne
 * garantissait : **un mouvement recrédité ne se finalise plus**. C'est
 * l'invariant qui protège du double-versement — rendre le solde au titulaire
 * *et* déclarer le retrait réussi.
 */
export class Transaction {
  private readonly _entete: Omit<
    TransactionSnapshot,
    | 'montant'
    | 'devise'
    | 'statut'
    | 'fournisseurRef'
    | 'metadata'
    | 'motifEchec'
  >;
  private readonly _montant: Money;
  private _statut: TransactionStatus;
  private _fournisseurRef: string | null;
  private _metadata: MetadonneesMouvement;
  private _motifEchec: string | null;

  /** @internal Réservé à `TransactionFactory` et `WalletOrmMapper`. */
  constructor(etat: TransactionSnapshot) {
    const {
      montant,
      devise,
      statut,
      fournisseurRef,
      metadata,
      motifEchec,
      ...entete
    } = etat;
    this._entete = entete;
    this._montant = Money.restore(montant, devise);
    this._statut = statut;
    this._fournisseurRef = fournisseurRef;
    this._metadata = metadata ?? {};
    this._motifEchec = motifEchec;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Le mouvement a abouti — les fonds sont arrivés.
   *
   * **Sans effet sur un mouvement déjà tranché.** Un webhook se redélivre, et
   * `payout.paid` peut arriver après qu'un `payout.failed` a rendu le solde :
   * finaliser alors reviendrait à verser deux fois. Cette garde était recopiée
   * chez l'appelant ; elle est ici, où elle vaut pour tous.
   *
   * @returns `true` si la transition a eu lieu, `false` si elle était sans objet
   *   — de quoi laisser l'appelant ne notifier qu'au premier passage.
   */
  reussir(): boolean {
    if (this.estTranchee()) return false;
    this._statut = TransactionStatus.REUSSI;
    return true;
  }

  /**
   * Le mouvement a échoué, motif à l'appui. Sans effet s'il est déjà tranché.
   */
  echouer(motif: string): boolean {
    if (this.estTranchee()) return false;
    this._statut = TransactionStatus.ECHOUE;
    this._motifEchec = motif;
    return true;
  }

  /**
   * Le solde est rendu au titulaire : le mouvement est défait.
   *
   * **Le geste comptable et sa trace ne se séparent pas.** Le drapeau
   * `recredited` est ce qui rend l'opération idempotente — il était posé par le
   * use case *après* le crédit, dans un objet `metadata` recomposé à la main,
   * si bien qu'un chemin qui oubliait de l'écrire rouvrait la porte au double
   * recrédit. Il est désormais posé par la transition elle-même.
   *
   * @param statutFinal `ECHOUE` quand le versement a échoué, `REMBOURSE` quand
   *   c'est le titulaire qui renonce — le domaine ne choisit pas à la place de
   *   l'appelant, mais il refuse tout ce qui n'est pas terminal.
   * @returns `false` si le solde avait déjà été rendu (no-op idempotent).
   */
  recrediter(
    motif: string,
    statutFinal: TransactionStatus,
    le: Date = new Date(),
  ): boolean {
    if (this.aEteRecreditee() || this.estTerminale()) return false;

    this._statut = STATUTS_TERMINAUX.includes(statutFinal)
      ? statutFinal
      : TransactionStatus.ECHOUE;
    this._motifEchec = motif;
    this._metadata = {
      ...this._metadata,
      recredited: true,
      recreditReason: motif,
      recreditedAt: le.toISOString(),
    };
    return true;
  }

  /**
   * Rattache le transfert plateforme → compte connecté.
   *
   * Il devient aussi la `fournisseurRef` du mouvement : c'est la référence par
   * laquelle Stripe le désigne, et elle portait jusque-là l'IBAN du parcours
   * manuel ou rien du tout.
   */
  rattacherLeTransfert(transferId: string): void {
    this._fournisseurRef = transferId;
    this._metadata = { ...this._metadata, transferId };
  }

  /** Rattache le versement compte connecté → banque, quand il est explicite. */
  rattacherLeVersement(payoutId: string): void {
    this._metadata = { ...this._metadata, payoutId };
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  /** Le solde a-t-il déjà été rendu au titulaire ? */
  aEteRecreditee(): boolean {
    return this._metadata.recredited === true;
  }

  /** Le mouvement est-il dans un état dont il ne revient pas ? */
  estTerminale(): boolean {
    return STATUTS_TERMINAUX.includes(this._statut);
  }

  /**
   * Le sort du mouvement est-il déjà fixé — abouti, terminal, ou défait ?
   *
   * Les trois ensemble, parce que les trois interdisent la même chose : rejouer
   * un versement. C'est la garde que `reussir` et `echouer` posent, et que les
   * appelants recopiaient chacun à leur façon.
   */
  estTranchee(): boolean {
    return (
      this._statut === TransactionStatus.REUSSI ||
      this.estTerminale() ||
      this.aEteRecreditee()
    );
  }

  estUnRetrait(): boolean {
    return this._entete.type === TransactionType.RETRAIT;
  }

  get id(): string {
    return this._entete.id;
  }

  /** Le montant comme somme — devise comprise. */
  get montant(): Money {
    return this._montant;
  }

  get statut(): TransactionStatus {
    return this._statut;
  }

  get type(): TransactionType {
    return this._entete.type;
  }

  /** Le portefeuille que ce mouvement traverse — voir {@link TransactionSnapshot}. */
  get walletId(): string | null {
    return this._entete.walletId ?? this._entete.walletSource;
  }

  get idempotencyKey(): string | null {
    return this._entete.idempotencyKey;
  }

  // Les rattachements métier du mouvement — à quoi il se rapporte. Ils sont en
  // lecture seule : un mouvement consigné ne change pas d'objet, il se défait.

  /** La souscription que ce mouvement règle, s'il en règle une. */
  get investissementId(): string | null {
    return this._entete.investissementId;
  }

  get echeanceId(): string | null {
    return this._entete.echeanceId;
  }

  get reservationId(): string | null {
    return this._entete.reservationId;
  }

  get projetId(): string | null {
    return this._entete.projetId;
  }

  get fournisseur(): TransactionFournisseur {
    return this._entete.fournisseur;
  }

  get motifEchec(): string | null {
    return this._motifEchec;
  }

  get createdAt(): Date {
    return this._entete.createdAt;
  }

  get fournisseurRef(): string | null {
    return this._fournisseurRef;
  }

  /** Le titulaire concerné, tel que le bagage du mouvement le porte. */
  get titulaireId(): number | null {
    const brut = this._metadata.userId;
    return typeof brut === 'number' ? brut : null;
  }

  /** Le transfert à rapatrier quand le versement échoue ; `null` s'il n'y en a pas. */
  get transfertId(): string | null {
    return this._metadata.transferId ?? null;
  }

  get metadata(): MetadonneesMouvement {
    return { ...this._metadata };
  }

  // ── Sérialisation ─────────────────────────────────────────────────────────

  /** L'état complet, pour la persistance et la présentation — des primitives. */
  snapshot(): TransactionSnapshot {
    return {
      ...this._entete,
      montant: this._montant.montant,
      devise: this._montant.devise,
      statut: this._statut,
      fournisseurRef: this._fournisseurRef,
      metadata: Object.keys(this._metadata).length > 0 ? this.metadata : null,
      motifEchec: this._motifEchec,
    };
  }

  /**
   * Point d'accroche de `res.json()` — sans quoi le mouvement ressortirait avec
   * ses clés privées. `WalletController` publie ces objets directement.
   */
  toJSON(): TransactionSnapshot {
    return this.snapshot();
  }
}
