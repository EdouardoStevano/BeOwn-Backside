import { WalletStatut, WalletType } from '../enums/wallet.enum';
import { Money } from '../value-objects/money.vo';
import {
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
  private _solde: Money;
  private _statut: WalletStatut;
  private readonly _entete: Omit<WalletSnapshot, 'solde' | 'devise' | 'statut'>;

  /** @internal Réservé à `WalletFactory` et `WalletOrmMapper`. */
  constructor(etat: WalletSnapshot) {
    const { solde, devise, statut, ...entete } = etat;
    this._solde = Money.restore(solde, devise);
    this._statut = statut;
    this._entete = entete;
  }

  // ── Mouvements ────────────────────────────────────────────────────────────

  /**
   * Alimente le portefeuille — dépôt, remboursement, coupon perçu.
   *
   * Le montant est une **somme**, pas un nombre : la devise voyage avec lui, et
   * n'est donc plus un paramètre facultatif qu'un appelant pouvait omettre pour
   * se dispenser du contrôle.
   */
  crediter(montant: Money): void {
    this.eprouverMouvement(montant);
    this._solde = this._solde.plus(montant);
  }

  /**
   * Entame le portefeuille — souscription, retrait, frais. Refuse si le solde
   * ne couvre pas le montant : c'est ici, et pas dans un `WHERE`, que la règle
   * « un solde ne passe jamais sous zéro » est écrite.
   */
  debiter(montant: Money): void {
    this.eprouverMouvement(montant);
    if (!this.couvre(montant)) {
      throw new SoldeInsuffisantError(this._solde.montant, montant.montant);
    }
    this._solde = this._solde.moins(montant);
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  /** Le solde suffit-il à ce débit ? Sans rien modifier. */
  couvre(montant: Money): boolean {
    return this._solde.couvre(montant);
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
    return this._solde.devise;
  }

  get solde(): number {
    return this._solde.montant;
  }

  /** Le solde comme somme — ce que les mouvements manipulent. */
  get avoir(): Money {
    return this._solde;
  }

  get statut(): WalletStatut {
    return this._statut;
  }

  get createdAt(): Date {
    return this._entete.createdAt;
  }

  /**
   * L'état complet, pour la persistance et la présentation — **des primitives**.
   *
   * `Money` ne franchit pas cette frontière : `solde` et `devise` en ressortent
   * à plat, exactement comme la table les range et comme les routes
   * `/wallets/*` les publient déjà. C'est la condition pour que le VO reste
   * confiné au contexte (voir {@link Money}).
   */
  snapshot(): WalletSnapshot {
    return {
      ...this._entete,
      ...this.soldeAPlat(),
      statut: this._statut,
    };
  }

  /**
   * Point d'accroche de `JSON.stringify`, donc de `res.json()`.
   *
   * Il manquait, et cela se voyait : `GET /users/me` publie le portefeuille tel
   * que le port le rend, sans appeler `snapshot()`. Sans cette méthode,
   * l'agrégat ressortait avec ses clés privées — `_solde`, `_statut`,
   * `_entete` — au lieu de son JSON public. Même raison et même remède que
   * `ProfilPP`, `User` et `KycCase`, qui la portent tous.
   */
  toJSON(): WalletSnapshot {
    return this.snapshot();
  }

  // ── Règles internes ───────────────────────────────────────────────────────

  /** Le solde tel que la table le range : le nombre d'un côté, sa devise de l'autre. */
  private soldeAPlat(): Pick<WalletSnapshot, 'solde' | 'devise'> {
    return { solde: this._solde.montant, devise: this._solde.devise };
  }

  /**
   * Les trois portes que tout mouvement franchit, crédit comme débit.
   *
   * La cohérence des devises n'y figure plus : elle est désormais portée par
   * `Money.plus` / `Money.moins`, qui ne savent pas additionner deux devises
   * différentes. Elle était ici sous condition — `if (devise !== undefined)` —
   * c'est-à-dire qu'un appelant s'en dispensait en n'en passant aucune, ce que
   * faisaient tous les appelants du contexte.
   */
  private eprouverMouvement(montant: Money): void {
    if (!this.estActif) {
      throw new WalletGeleError(this._statut);
    }
    if (!montant.estPositif()) {
      throw new MontantDeMouvementInvalideError(montant.montant);
    }
  }
}
