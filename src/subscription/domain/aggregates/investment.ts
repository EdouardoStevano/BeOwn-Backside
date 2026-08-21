import { InvestmentStatus } from '../enums/investment-status.enum';
import {
  AccesInvestissementRefuseError,
  DelaiDeRetractationExpireError,
  InvestissementDejaSigneError,
  InvestissementNonCompletableError,
  InvestissementNonRetractableError,
  InvestissementSansFractionsActivesError,
  QuantiteDeFractionsInvalideError,
  RetractationReserveeAuTitulaireError,
  SansDelaiDeRetractationError,
} from '../errors/subscription.errors';

/**
 * Le projet tel qu'il accompagne un investissement en lecture — la relation
 * jointe par le repository, rendue telle quelle par les routes `/investments`.
 * Ce n'est pas une dépendance du domaine vers `catalog` (§3.2) : les règles de
 * l'agrégat n'en lisent aucun champ, seule la présentation le sérialise.
 */
export interface InvestmentProjet {
  id: string;
  titre: string;
  ville: string | null;
  pays: string;
  type: string;
  triCible: number | null;
  dureeMois: number;
  prixFraction: number | null;
  nbFractions: number | null;
}

/**
 * État complet de l'investissement, tel qu'il transite depuis/vers la
 * persistance et tel qu'il est publié. Clés inchangées : les routes
 * `/investments/*` rendent le même JSON qu'avant l'introduction de l'agrégat.
 */
export interface InvestmentSnapshot {
  id: string;
  projetId: string;
  utilisateurId: number;
  montant: number;
  instrument: string;
  nbTitres: number | null;
  valeurTitre: number | null;
  statut: InvestmentStatus;
  delaiRetractationJusquAu: Date | null;
  bulletinDocId: string | null;
  signatureId: string | null;
  reservationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  projet?: InvestmentProjet;
}

/** État d'un investissement qui vient de naître, avant tout passage en base. */
export type InvestmentNaissant = Omit<
  InvestmentSnapshot,
  'id' | 'createdAt' | 'updatedAt' | 'projet'
>;

/**
 * **Investissement (souscription obligataire)** — l'agrégat racine du contexte
 * `subscription` (§3.2, M6) : l'engagement d'un investisseur sur un projet en
 * cours de collecte, matérialisé par des fractions d'obligation et un bulletin
 * de souscription signé.
 *
 * Deux chemins de naissance, selon que les fonds sont débités tout de suite ou
 * après signature — {@link InvestmentFactory} les distingue :
 *
 * ```text
 *  souscrire()  ─────────────────────────────▶ CONFIRME
 *                                                 │
 *  initier() ──▶ INITIE                    completer()  (reste CONFIRME)
 *                  │                              │
 *      rattacherDemandeDeSignature()        retracter() ──▶ RETRACTE
 * ```
 *
 * Les statuts que l'énumération porte sans transition dédiée (`SIGNE`, `PAYE`,
 * `ANNULE`, `REMBOURSE_*`…) sont posés ailleurs : par des opérations de masse
 * (`RefundCollecteService` annule tous les investissements d'une collecte
 * ratée en un `UPDATE`, RG-INV-11) ou par l'override du back-office. Ils
 * n'ont pas de méthode ici tant qu'aucun appelant n'exprime l'intention
 * correspondante — une transition sans appelant serait une abstraction sans
 * responsabilité (§43).
 *
 * Invariants protégés ici, et nulle part ailleurs :
 *
 * - **la fenêtre de rétractation PSFP** — se rétracter exige d'être le
 *   titulaire, d'être `CONFIRME`, d'avoir une fenêtre ouverte (donc d'être
 *   non-averti : un averti n'en a pas) et d'être encore dedans. Ces quatre
 *   conditions vivaient en quatre `if` dans `CancelInvestmentUseCase`, entre
 *   un verrou pessimiste et un recrédit de wallet ;
 * - **un investissement rétracté ou annulé est immuable** — il ne se complète
 *   pas, ne se signe pas, et ne compte plus dans les fractions vendues ;
 * - **compléter n'est possible que sur un `CONFIRME` encore porteur de
 *   fractions** — la règle vivait dans `TopUpInvestmentUseCase` ;
 * - **la signature ne se rejoue pas** : un investissement déjà signé qui
 *   resignerait perdrait la trace de la signature qui l'engage.
 *
 * Ce que l'agrégat ne protège **pas**, délibérément : l'anti-survente et le
 * plafond de collecte du projet. Ce sont des invariants qui portent sur
 * *l'ensemble* des investissements d'un même projet, pas sur un investissement
 * isolé — {@link CollecteCapacity} les possède (§6, même raisonnement que
 * `ReservationCapacity` sur le Core Domain).
 */
export class Investment {
  private _montant: number;
  private _nbTitres: number | null;
  private _statut: InvestmentStatus;
  private _delaiRetractationJusquAu: Date | null;
  private _bulletinDocId: string | null;
  private _signatureId: string | null;
  private readonly _entete: Omit<
    InvestmentSnapshot,
    | 'montant'
    | 'nbTitres'
    | 'statut'
    | 'delaiRetractationJusquAu'
    | 'bulletinDocId'
    | 'signatureId'
  >;

  /** @internal Réservé à `InvestmentFactory` et `InvestmentOrmMapper`. */
  constructor(etat: InvestmentSnapshot) {
    const {
      montant,
      nbTitres,
      statut,
      delaiRetractationJusquAu,
      bulletinDocId,
      signatureId,
      ...entete
    } = etat;
    this._montant = montant;
    this._nbTitres = nbTitres;
    this._statut = statut;
    this._delaiRetractationJusquAu = delaiRetractationJusquAu;
    this._bulletinDocId = bulletinDocId;
    this._signatureId = signatureId;
    this._entete = entete;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Une demande de signature électronique a été ouverte chez le prestataire
   * (RG-INV-06 : signature en self-service, pas de validation manuelle
   * interne — §7). L'investissement reste `INITIE` : c'est le retour du
   * prestataire, plus tard, qui atteste que le bulletin est signé.
   *
   * Un investissement déjà signé n'ouvre pas de nouvelle demande — il perdrait
   * la trace de la signature qui l'engage.
   */
  rattacherDemandeDeSignature(signatureId: string): void {
    if (this._statut === InvestmentStatus.SIGNE) {
      throw new InvestissementDejaSigneError();
    }
    this._signatureId = signatureId;
  }

  /**
   * **Droit de rétractation PSFP** — l'investisseur non-averti retire son
   * engagement dans les 4 jours et se fait intégralement rembourser.
   *
   * Les quatre portes, dans l'ordre où l'investisseur les rencontre : être le
   * titulaire, être sur un investissement encore rétractable, avoir une
   * fenêtre (donc être non-averti), et être encore dedans.
   */
  retracter(utilisateurId: number, maintenant: Date = new Date()): void {
    if (this._entete.utilisateurId !== utilisateurId) {
      throw new RetractationReserveeAuTitulaireError();
    }
    if (this._statut !== InvestmentStatus.CONFIRME) {
      throw new InvestissementNonRetractableError(this._statut);
    }
    if (this._delaiRetractationJusquAu === null) {
      throw new SansDelaiDeRetractationError();
    }
    if (maintenant > new Date(this._delaiRetractationJusquAu)) {
      throw new DelaiDeRetractationExpireError(this._delaiRetractationJusquAu);
    }

    this._statut = InvestmentStatus.RETRACTE;
  }

  /**
   * L'investisseur ajoute des fractions à une souscription déjà confirmée.
   * Rend le montant à débiter — le prix retenu est celui payé à la
   * souscription initiale (`valeurTitre`), pour qu'un changement de tarif du
   * projet ne rétro-tarife pas un investissement existant ;
   * `prixFractionDeReference` ne sert que si l'investissement n'en portait pas.
   */
  completer(
    utilisateurId: number,
    nbFractions: number,
    prixFractionDeReference: number,
  ): number {
    if (this._entete.utilisateurId !== utilisateurId) {
      throw new AccesInvestissementRefuseError();
    }
    if (this._statut !== InvestmentStatus.CONFIRME) {
      throw new InvestissementNonCompletableError(this._statut);
    }
    if (this._nbTitres === null || this._nbTitres <= 0) {
      throw new InvestissementSansFractionsActivesError();
    }
    if (!Number.isInteger(nbFractions) || nbFractions <= 0) {
      throw new QuantiteDeFractionsInvalideError(nbFractions);
    }

    const prixFraction = this._valeurTitreEffective(prixFractionDeReference);
    const montantDelta = nbFractions * prixFraction;

    this._nbTitres += nbFractions;
    this._montant += montantDelta;

    return montantDelta;
  }

  /** Le bulletin de souscription généré est rattaché à l'investissement. */
  attacherBulletin(bulletinDocId: string): void {
    this._bulletinDocId = bulletinDocId;
  }

  /**
   * **Override du back-office** — pose un statut arbitraire, hors de tout
   * cycle de vie.
   *
   * Ce n'est pas une transition métier, et le nom le dit : c'est la reprise
   * en main manuelle qu'expose la route admin `PATCH /investments/:id/status`
   * (rattrapage d'un règlement hors plateforme, correction d'une donnée
   * migrée). Elle passe malgré tout par l'agrégat — le code externe ne modifie
   * jamais l'état interne directement (§6) — pour qu'un tel forçage reste
   * visible et cherchable, plutôt que dissous dans un `UPDATE` du repository.
   *
   * Toute évolution qui saurait *pourquoi* l'admin change ce statut mérite sa
   * propre transition nommée (§4) ; en l'état, le back-office n'exprime pas
   * cette intention.
   */
  forcerStatutParAdministration(statut: InvestmentStatus): void {
    this._statut = statut;
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

  get montant(): number {
    return this._montant;
  }

  get instrument(): string {
    return this._entete.instrument;
  }

  get nbTitres(): number | null {
    return this._nbTitres;
  }

  get valeurTitre(): number | null {
    return this._entete.valeurTitre;
  }

  get statut(): InvestmentStatus {
    return this._statut;
  }

  get delaiRetractationJusquAu(): Date | null {
    return this._delaiRetractationJusquAu;
  }

  get bulletinDocId(): string | null {
    return this._bulletinDocId;
  }

  get signatureId(): string | null {
    return this._signatureId;
  }

  get reservationId(): string | null {
    return this._entete.reservationId;
  }

  get createdAt(): Date {
    return this._entete.createdAt;
  }

  get updatedAt(): Date {
    return this._entete.updatedAt;
  }

  get projet(): InvestmentProjet | undefined {
    return this._entete.projet;
  }

  /**
   * L'investissement pèse encore sur la collecte du projet. Même filtre que le
   * recompte des fractions vendues : un rétracté ou un annulé a rendu ses
   * fractions au marché.
   */
  get estActif(): boolean {
    return (
      this._statut !== InvestmentStatus.RETRACTE &&
      this._statut !== InvestmentStatus.ANNULE
    );
  }

  /** La fenêtre de rétractation PSFP est ouverte à cet instant. */
  estRetractable(maintenant: Date = new Date()): boolean {
    return (
      this._statut === InvestmentStatus.CONFIRME &&
      this._delaiRetractationJusquAu !== null &&
      maintenant <= new Date(this._delaiRetractationJusquAu)
    );
  }

  /** L'état complet, pour la persistance et la présentation. */
  snapshot(): InvestmentSnapshot {
    return {
      ...this._entete,
      montant: this._montant,
      nbTitres: this._nbTitres,
      statut: this._statut,
      delaiRetractationJusquAu: this._delaiRetractationJusquAu,
      bulletinDocId: this._bulletinDocId,
      signatureId: this._signatureId,
    };
  }

  // ── Règles internes ───────────────────────────────────────────────────────

  private _valeurTitreEffective(prixFractionDeReference: number): number {
    return this._entete.valeurTitre ?? prixFractionDeReference;
  }
}
