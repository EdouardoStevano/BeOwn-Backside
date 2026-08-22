import { OrdreMarcheSens, OrdreMarcheStatus } from '../enums/ordre-marche.enum';
import {
  AchatDeSonPropreOrdreError,
  AnnulationReserveeAuVendeurError,
  AucunAcheteurSurLOrdreError,
  ForcageReserveAuxMatchsProposesError,
  OrdreDejaClosError,
  OrdreDeVenteInvalideError,
  OrdreIndisponibleError,
  OrdreNonAnnulableError,
  QuantiteAcheteeInvalideError,
} from '../errors';

/** État complet d'un ordre, tel qu'il transite depuis/vers la persistance. */
export interface SecondaryMarketOrderSnapshot {
  id: string;
  investissementId: string;
  vendeurId: number;
  acheteurId: number | null;
  sens: OrdreMarcheSens;
  nbFractions: number;
  prixUnitaire: number;
  montant: number;
  statut: OrdreMarcheStatus;
  valideJusquAu: Date | null;
  createdAt: Date;
}

/** Un ordre qui vient d'être passé, avant tout passage en base. */
export type SecondaryMarketOrderNaissant = Omit<
  SecondaryMarketOrderSnapshot,
  'id' | 'createdAt'
>;

/** Ce qu'une exécution produit, pour que l'application sache quoi régler. */
export interface ExecutionDeCession {
  /** Fractions effectivement cédées. */
  fractionsCedees: number;
  /** Somme que l'acheteur doit au vendeur : fractions × prix unitaire. */
  montantRegle: number;
  /** L'ordre est-il soldé, ou reste-t-il des fractions au carnet ? */
  integralement: boolean;
  /** Fractions encore offertes après l'exécution. */
  fractionsRestantes: number;
}

/**
 * **Ordre du marché secondaire** (M9) — une annonce de cession au carnet : un
 * porteur offre N fractions d'un de ses investissements à un prix unitaire
 * donné, et un autre investisseur les reprend, en tout ou partie.
 *
 * C'est l'agrégat racine du contexte (§6). Il remplace une classe `OrdreMarche`
 * de douze champs publics sans un comportement (§7), que personne n'instanciait :
 * le cycle de vie de l'ordre vivait en toutes lettres dans
 * `SecondaryMarketController`, réparti entre `createOrder`, `executeOrder` et
 * `cancelOrder` — et la validation d'achat y était **recopiée** dans
 * `InitiateBuyUseCase`, à l'identique, pour la jouer avant la signature.
 *
 * Trois règles y étaient noyées dans la mécanique transactionnelle, et sont
 * ici :
 *
 * - **seul un ordre `EN_CARNET` bouge.** Exécuter ou annuler un ordre déjà
 *   exécuté est un conflit d'état, pas une requête malformée ;
 * - **le vendeur n'est pas son propre acheteur.** Une cession à soi-même
 *   ferait tourner les frais de plateforme à vide, sans transfert réel ;
 * - **le montant se dérive, il ne se fournit pas.** `CreateOrdreMarcheDto`
 *   porte un champ `montant` que le contrôleur recalculait silencieusement —
 *   l'agrégat le tient comme un invariant, à la création comme après une
 *   exécution partielle.
 *
 * Il ne connaît de l'investissement cédé que son identifiant (§6.2), et des
 * deux parties que leur identifiant de compte. Combien de fractions le vendeur
 * peut mettre au carnet est une question qui porte sur *tous* les ordres d'un
 * même investissement : elle appartient à `CapaciteDeCession`, pas ici.
 */
export class SecondaryMarketOrder {
  private _acheteurId: number | null;
  private _nbFractions: number;
  private _montant: number;
  private _statut: OrdreMarcheStatus;
  private readonly _entete: Omit<
    SecondaryMarketOrderSnapshot,
    'acheteurId' | 'nbFractions' | 'montant' | 'statut'
  >;

  /** @internal Réservé à `passer` et à `OrdreMarcheOrmMapper`. */
  constructor(etat: SecondaryMarketOrderSnapshot) {
    const { acheteurId, nbFractions, montant, statut, ...entete } = etat;
    this._acheteurId = acheteurId;
    this._nbFractions = nbFractions;
    this._montant = montant;
    this._statut = statut;
    this._entete = entete;
  }

  /**
   * Passe un ordre de vente au carnet. La quantité et le prix sont validés
   * ici — le DTO garantit qu'ils sont positifs, l'agrégat garantit qu'ils font
   * une annonce sensée, y compris pour les appelants qui ne passent pas par
   * HTTP (seed, back-office, reprise de données).
   */
  static passer(demande: {
    investissementId: string;
    vendeurId: number;
    sens: OrdreMarcheSens;
    nbFractions: number;
    prixUnitaire: number;
    valideJusquAu: Date | null;
  }): SecondaryMarketOrderNaissant {
    if (!Number.isInteger(demande.nbFractions) || demande.nbFractions < 1) {
      throw new OrdreDeVenteInvalideError(
        'le nombre de fractions doit être un entier positif',
        { nbFractions: demande.nbFractions },
      );
    }
    if (!Number.isFinite(demande.prixUnitaire) || demande.prixUnitaire <= 0) {
      throw new OrdreDeVenteInvalideError(
        'le prix unitaire doit être positif',
        {
          prixUnitaire: demande.prixUnitaire,
        },
      );
    }

    return {
      investissementId: demande.investissementId,
      vendeurId: demande.vendeurId,
      acheteurId: null,
      sens: demande.sens,
      nbFractions: demande.nbFractions,
      prixUnitaire: demande.prixUnitaire,
      montant: round2(demande.nbFractions * demande.prixUnitaire),
      statut: OrdreMarcheStatus.EN_CARNET,
      valideJusquAu: demande.valideJusquAu,
    };
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Cède `nbFractions` à `acheteurId`. Un achat total solde l'ordre et lui
   * attribue son acheteur ; un achat partiel laisse le reste au carnet, au
   * même prix unitaire, et le montant suit.
   *
   * La règle ne dit rien du règlement financier ni du transfert de titres :
   * elle rend ce qu'il faut régler, l'application l'exécute (§14).
   */
  executer(nbFractions: number, acheteurId: number): ExecutionDeCession {
    this.assertAchetablePar(nbFractions, acheteurId);

    const montantRegle = this.montantPour(nbFractions);
    const integralement = nbFractions === this._nbFractions;

    if (integralement) {
      this._acheteurId = acheteurId;
      this._statut = OrdreMarcheStatus.EXECUTE;
    } else {
      this._nbFractions -= nbFractions;
      this._montant = round2(this._nbFractions * this._entete.prixUnitaire);
    }

    return {
      fractionsCedees: nbFractions,
      montantRegle,
      integralement,
      fractionsRestantes: integralement ? 0 : this._nbFractions,
    };
  }

  /** Retire l'annonce du carnet. Réservé au vendeur, et à lui seul. */
  annuler(parVendeurId: number): void {
    if (parVendeurId !== this._entete.vendeurId) {
      throw new AnnulationReserveeAuVendeurError();
    }
    if (!this.estAuCarnet) {
      throw new OrdreNonAnnulableError();
    }

    this._statut = OrdreMarcheStatus.ANNULE;
  }

  /**
   * **L'administration annule l'ordre**, y compris après exécution.
   *
   * Ce n'est pas le même geste que `annuler` : le vendeur retire une annonce
   * encore au carnet, l'administration défait une cession qui n'aurait pas dû
   * avoir lieu. Elle peut donc frapper un ordre déjà exécuté — et c'est
   * précisément là que la question devient financière.
   *
   * L'agrégat répond à la seule question qui lui revient : **faut-il défaire un
   * règlement ?** Oui si des fonds ont bougé — ordre exécuté, ou apparié avec un
   * acheteur ; non si l'annonce dormait au carnet. Défaire ce règlement — rendre
   * les fractions, rembourser l'acheteur, reprendre au vendeur son net et à la
   * plateforme sa commission — appartient à l'application, qui seule voit les
   * wallets et le ledger (§14).
   *
   * Un ordre déjà annulé ou expiré n'a rien à défaire.
   */
  annulerParAdministration(): { reverseNecessaire: boolean } {
    if (
      this._statut === OrdreMarcheStatus.ANNULE ||
      this._statut === OrdreMarcheStatus.EXPIRE
    ) {
      throw new OrdreDejaClosError(this._statut);
    }

    const reverseNecessaire = !this.estAuCarnet && this._acheteurId !== null;
    this._statut = OrdreMarcheStatus.ANNULE;

    return { reverseNecessaire };
  }

  /**
   * **L'administration force l'exécution** d'un appariement resté en suspens.
   *
   * Réservé à `MATCH_PROPOSE` : c'est l'état d'un ordre à qui un acheteur a été
   * proposé sans que la cession se conclue. Forcer un ordre encore au carnet
   * n'aurait pas de sens — personne n'est en face.
   */
  forcerExecution(): void {
    if (this._statut !== OrdreMarcheStatus.MATCH_PROPOSE) {
      throw new ForcageReserveAuxMatchsProposesError(this._statut);
    }
    if (this._acheteurId === null) {
      throw new AucunAcheteurSurLOrdreError();
    }

    this._statut = OrdreMarcheStatus.EXECUTE;
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  /**
   * Éprouve un achat sans le jouer — ce dont l'initiation a besoin : elle
   * valide, génère le contrat et part en signature, l'exécution ne venant
   * qu'au retour du webhook.
   */
  assertAchetablePar(nbFractions: number, acheteurId: number): void {
    if (!this.estAuCarnet) {
      throw new OrdreIndisponibleError();
    }
    if (acheteurId === this._entete.vendeurId) {
      throw new AchatDeSonPropreOrdreError();
    }
    if (
      !Number.isInteger(nbFractions) ||
      nbFractions < 1 ||
      nbFractions > this._nbFractions
    ) {
      throw new QuantiteAcheteeInvalideError(this._nbFractions);
    }
  }

  /** Ce que coûtent `nbFractions` de cet ordre. */
  montantPour(nbFractions: number): number {
    return round2(nbFractions * this._entete.prixUnitaire);
  }

  get estAuCarnet(): boolean {
    return this._statut === OrdreMarcheStatus.EN_CARNET;
  }

  get id(): string {
    return this._entete.id;
  }

  get investissementId(): string {
    return this._entete.investissementId;
  }

  get vendeurId(): number {
    return this._entete.vendeurId;
  }

  get acheteurId(): number | null {
    return this._acheteurId;
  }

  get sens(): OrdreMarcheSens {
    return this._entete.sens;
  }

  get nbFractions(): number {
    return this._nbFractions;
  }

  get prixUnitaire(): number {
    return this._entete.prixUnitaire;
  }

  get montant(): number {
    return this._montant;
  }

  get statut(): OrdreMarcheStatus {
    return this._statut;
  }

  get valideJusquAu(): Date | null {
    return this._entete.valideJusquAu;
  }

  /** L'état complet, pour la persistance et la présentation. */
  snapshot(): SecondaryMarketOrderSnapshot {
    return {
      ...this._entete,
      acheteurId: this._acheteurId,
      nbFractions: this._nbFractions,
      montant: this._montant,
      statut: this._statut,
    };
  }
}

const round2 = (montant: number): number => Math.round(montant * 100) / 100;
