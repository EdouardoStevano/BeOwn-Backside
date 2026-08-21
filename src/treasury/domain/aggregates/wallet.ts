import { WalletStatut, WalletType } from '../enums/wallet.enum';
import {
  DeviseIncoherenteError,
  MontantDeMouvementInvalideError,
  SoldeInsuffisantError,
  WalletGeleError,
} from '../errors/treasury.errors';

/**
 * État complet du portefeuille, tel qu'il transite depuis/vers la persistance
 * et tel qu'il est publié. Clés inchangées : les routes `/wallets/*` rendent le
 * même JSON qu'avant l'introduction de l'agrégat.
 */
export interface WalletSnapshot {
  id: string;
  type: WalletType;
  proprietaireUserId: number | null;
  projetId: string | null;
  spvId: string | null;
  fournisseurRef: string;
  devise: string;
  solde: number;
  statut: WalletStatut;
  createdAt: Date;
}

/** État d'un portefeuille qui vient d'être ouvert, avant tout passage en base. */
export type WalletNaissant = Omit<WalletSnapshot, 'id' | 'createdAt'>;

/**
 * **Wallet (portefeuille)** — l'agrégat racine du contexte `treasury` (§3.2,
 * M7) : un solde, sa devise, et son titulaire — un investisseur, un projet,
 * un SPV, ou la plateforme elle-même.
 *
 * Invariants protégés ici, et nulle part ailleurs :
 *
 * - **un solde ne passe jamais sous zéro.** C'est l'invariant central de la
 *   trésorerie ; il n'était gardé nulle part dans le modèle — `solde` était un
 *   champ public que chaque appelant décrémentait à sa main, et la seule
 *   protection vivait dans un `WHERE solde >= :amount` au fond d'un
 *   `QueryBuilder` ;
 * - **un portefeuille gelé ne bouge pas**, ni en crédit ni en débit ;
 * - **un mouvement est strictement positif** — créditer zéro n'est pas un
 *   mouvement, et créditer un montant négatif est un débit qui n'ose pas dire
 *   son nom ;
 * - **un mouvement se fait dans la devise du portefeuille** : imputer des
 *   dollars sur un solde en euros le rendrait faux, et la conversion n'est pas
 *   du ressort de ce contexte.
 *
 * **L'agrégat dit la règle ; il ne la rend pas atomique.** Les parcours
 * concurrents (retrait, souscription, règlement de coupon) rejouent la même
 * décision en base par un décrément conditionnel — `SET solde = solde - :x
 * WHERE solde >= :x` — sous verrou pessimiste. C'est la même répartition que
 * `Echeance.payer()` et son claim dans `subscription` : le verrou protège
 * contre la concurrence, l'agrégat protège la règle. Les deux sont
 * nécessaires, et aucun ne remplace l'autre.
 *
 * > Ce que l'agrégat ne porte **pas encore** : le **HOLD** (§4.1 —
 * > `Wallet.hold()` / `HeldFunds`), le verrouillage de fonds dont le Core
 * > Domain a besoin pour le pré-investissement. La colonne n'existe pas en
 * > base : le portefeuille ne connaît qu'un solde, pas une part verrouillée.
 * > L'ajouter est une évolution du schéma et une capacité nouvelle, pas un
 * > refactoring — et l'inventer ici donnerait l'illusion que `reservation`
 * > peut déjà s'appuyer dessus.
 */
export class Wallet {
  private _solde: number;
  private _statut: WalletStatut;
  private readonly _entete: Omit<WalletSnapshot, 'solde' | 'statut'>;

  /** @internal Réservé à `WalletFactory` et `WalletOrmMapper`. */
  constructor(etat: WalletSnapshot) {
    const { solde, statut, ...entete } = etat;
    this._solde = solde;
    this._statut = statut;
    this._entete = entete;
  }

  // ── Mouvements ────────────────────────────────────────────────────────────

  /** Alimente le portefeuille — dépôt, remboursement, coupon perçu. */
  crediter(montant: number, devise?: string): void {
    this.eprouverMouvement(montant, devise);
    this._solde += montant;
  }

  /**
   * Entame le portefeuille — souscription, retrait, frais. Refuse si le solde
   * ne couvre pas le montant : c'est ici, et pas dans un `WHERE`, que la règle
   * « un solde ne passe jamais sous zéro » est écrite.
   */
  debiter(montant: number, devise?: string): void {
    this.eprouverMouvement(montant, devise);
    if (!this.couvre(montant)) {
      throw new SoldeInsuffisantError(this._solde, montant);
    }
    this._solde -= montant;
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  /** Le solde suffit-il à ce débit ? Sans rien modifier. */
  couvre(montant: number): boolean {
    return this._solde >= montant;
  }

  /** Le portefeuille accepte-t-il des mouvements ? */
  get estActif(): boolean {
    return this._statut === WalletStatut.ACTIF;
  }

  /** Ce portefeuille est-il celui de cet utilisateur ? (anti-BOLA côté lecture) */
  appartientA(utilisateurId: number): boolean {
    return this._entete.proprietaireUserId === utilisateurId;
  }

  get id(): string {
    return this._entete.id;
  }

  get type(): WalletType {
    return this._entete.type;
  }

  get proprietaireUserId(): number | null {
    return this._entete.proprietaireUserId;
  }

  get projetId(): string | null {
    return this._entete.projetId;
  }

  get spvId(): string | null {
    return this._entete.spvId;
  }

  get fournisseurRef(): string {
    return this._entete.fournisseurRef;
  }

  get devise(): string {
    return this._entete.devise;
  }

  get solde(): number {
    return this._solde;
  }

  get statut(): WalletStatut {
    return this._statut;
  }

  get createdAt(): Date {
    return this._entete.createdAt;
  }

  /** L'état complet, pour la persistance et la présentation. */
  snapshot(): WalletSnapshot {
    return {
      ...this._entete,
      solde: this._solde,
      statut: this._statut,
    };
  }

  // ── Règles internes ───────────────────────────────────────────────────────

  /** Les trois portes que tout mouvement franchit, crédit comme débit. */
  private eprouverMouvement(montant: number, devise?: string): void {
    if (!this.estActif) {
      throw new WalletGeleError(this._statut);
    }
    if (!Number.isFinite(montant) || montant <= 0) {
      throw new MontantDeMouvementInvalideError(montant);
    }
    if (devise !== undefined && devise !== this._entete.devise) {
      throw new DeviseIncoherenteError(this._entete.devise, devise);
    }
  }
}
