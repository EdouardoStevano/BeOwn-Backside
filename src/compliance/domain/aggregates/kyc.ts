import { KycNiveau, KycStatus } from '../enums/kyc-status.enum';
import { KycMapper } from '../mappers/kyc.mapper';
import {
  DecisionKyc,
  DecisionKycSnapshot,
  DecisionKycSnapshotBrut,
} from '../value-objects/decision-kyc.vo';

/** Ce que le fournisseur a lu sur la pièce d'identité, tel qu'il le rend. */
export interface KycIdentiteExtrait {
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
  nationalite?: string;
  typeDocument?: string;
  numeroDocument?: string;
  dateExpiration?: string;
  documentFrontFileId?: string;
  documentBackFileId?: string;
  selfieFileId?: string;
}

// Le titulaire du dossier ne vit plus ici. `TitulaireKyc` était une projection
// d'un **autre** Bounded Context (IAM) portée par cet agrégat, remplie par une
// jointure ORM vers `UserEntity` — donc par une dépendance de Profiles sur
// l'infrastructure d'IAM (§12.7). Elle ne servait aucune règle : seule la liste
// d'administration la publiait.
//
// Elle est reconstituée là où elle est affichée, par le port `USER_REPOSITORY`
// et à partir du seul `utilisateurId` : voir `GetKycUseCase.executeAll`. Le
// JSON rendu par `GET /kyc/all` est inchangé.

/** Ce que le dossier ajoute à son bloc : sa clé, le compte rattaché, ses dates. */
export interface EnteteKyc {
  id: string;
  utilisateurId: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * État complet du dossier, tel qu'il transite depuis/vers la persistance.
 *
 * Des primitives uniquement, à plat : les Value Objects ne franchissent pas la
 * frontière du domaine (§12.7), et la forme plate est celle de la table. Les
 * clés sont exactement celles publiées avant le découpage — `GET /kyc/me`,
 * `GET /kyc/all` et `GET /users/me` renvoient le même JSON.
 */
export interface KycSnapshot extends EnteteKyc, DecisionKycSnapshot {
  niveau: KycNiveau;
  scoreRisque: number | null;
  fournisseur: string;
  fournisseurRef: string | null;
  stripeReportId: string | null;
  identiteExtrait: KycIdentiteExtrait | null;
}

/**
 * Ce que `restore` accepte : le snapshot, mais tolérant sur les colonnes qu'un
 * `save()` ne relit pas — TypeORM rend l'entité qu'on lui a passée, donc sans
 * les colonnes qu'elle n'a pas écrites.
 */
export interface KycSnapshotBrut
  extends
    Omit<
      KycSnapshot,
      | keyof DecisionKycSnapshot
      | 'scoreRisque'
      | 'fournisseurRef'
      | 'stripeReportId'
      | 'identiteExtrait'
    >,
    DecisionKycSnapshotBrut {
  scoreRisque?: number | null;
  fournisseurRef?: string | null;
  stripeReportId?: string | null;
  identiteExtrait?: KycIdentiteExtrait | null;
}

/**
 * Dossier de vérification d'identité — un par compte.
 *
 * L'agrégat était une classe à treize attributs publics et mutables, sans
 * constructeur : on le faisait naître en écrivant `new Kyc()` puis huit
 * affectations, recopiées à l'identique dans `CreateKycUseCase` et dans
 * la couche présentation de Payments. Deux naissances, donc deux occasions de
 * diverger — et rien n'empêchait la troisième d'ouvrir un dossier directement
 * `VALIDE`, ce qui suffit à débloquer dépôts, investissements et retraits
 * (`KycValidatedGuard` ne regarde que ce statut). Naître appartient désormais à
 * {@link KycFactory}, renaître à {@link KycMapper}, tous deux passant par le
 * constructeur `@internal`.
 *
 * **Un seul bloc** : {@link DecisionKyc}, qui réunit statut, motif de refus et
 * échéance de validité parce que ces trois-là partagent un invariant. Le
 * niveau d'examen, le score de risque et les références du fournisseur restent
 * à plat — ce sont des valeurs indépendantes, et les empaqueter produirait un
 * bloc nommé d'après rien (cf. `ProfilPM`).
 *
 * **Aucune transition pour l'instant, et c'est délibéré.** Les changements
 * d'état passent aujourd'hui par des `UPDATE` directs du repository
 * (`updateStatus`, `updateSession`, `updateReportData`), appelés depuis les
 * use cases de webhook de ce contexte. Les rapatrier ici est le pas suivant ;
 * inventer dès maintenant des méthodes que personne n'appelle n'aurait produit
 * que du code mort. Tous les attributs sont donc `readonly` : l'agrégat est
 * exact sur ce qu'il garantit — un dossier ne change pas d'état par lui-même.
 */
export class Kyc {
  private readonly _id: string;
  private readonly _utilisateurId: number;
  private readonly _decision: DecisionKyc;
  private readonly _niveau: KycNiveau;
  private readonly _scoreRisque: number | null;
  private readonly _fournisseur: string;
  private readonly _fournisseurRef: string | null;
  private readonly _stripeReportId: string | null;
  private readonly _identiteExtrait: KycIdentiteExtrait | null;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  /**
   * @internal Réservé à `KycFactory` et `KycMapper`.
   *
   * Public faute de mieux : TypeScript n'a pas de classe amie, et ces deux-là
   * — qui font respectivement naître et renaître un dossier — doivent pouvoir
   * l'appeler. Il n'éprouve rien : passer par ici, c'est se déclarer fabrique
   * ou mapper, et prendre à sa charge les invariants que l'une pose et que
   * l'autre assume de ne pas rejouer.
   */
  constructor(etat: {
    entete: EnteteKyc;
    decision: DecisionKyc;
    niveau: KycNiveau;
    scoreRisque: number | null;
    fournisseur: string;
    fournisseurRef: string | null;
    stripeReportId: string | null;
    identiteExtrait: KycIdentiteExtrait | null;
  }) {
    this._id = etat.entete.id;
    this._utilisateurId = etat.entete.utilisateurId;
    this._createdAt = etat.entete.createdAt;
    this._updatedAt = etat.entete.updatedAt;
    this._decision = etat.decision;
    this._niveau = etat.niveau;
    this._scoreRisque = etat.scoreRisque;
    this._fournisseur = etat.fournisseur;
    this._fournisseurRef = etat.fournisseurRef;
    this._stripeReportId = etat.stripeReportId;
    this._identiteExtrait = etat.identiteExtrait;
  }

  // ── Règles propres au dossier ─────────────────────────────────────────────

  /** @see DecisionKyc.estEnRevueManuelle */
  estEnRevueManuelle(): boolean {
    return this._decision.estEnRevueManuelle();
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get id(): string {
    return this._id;
  }
  get utilisateurId(): number {
    return this._utilisateurId;
  }
  get decision(): DecisionKyc {
    return this._decision;
  }
  get niveau(): KycNiveau {
    return this._niveau;
  }
  get scoreRisque(): number | null {
    return this._scoreRisque;
  }
  get fournisseur(): string {
    return this._fournisseur;
  }
  /** Session ouverte chez le fournisseur (`vs_xxx` pour Stripe Identity). */
  get fournisseurRef(): string | null {
    return this._fournisseurRef;
  }
  get stripeReportId(): string | null {
    return this._stripeReportId;
  }
  get identiteExtrait(): KycIdentiteExtrait | null {
    return this._identiteExtrait;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ── Délégations ───────────────────────────────────────────────────────────
  //
  // Ce que les autres contextes lisent réellement sur un dossier. Le reste
  // passe par {@link decision}.

  get statut(): KycStatus {
    return this._decision.statut;
  }
  get motifRefus(): string | null {
    return this._decision.motifRefus;
  }
  get valideJusquAu(): string | null {
    return this._decision.valideJusquAu;
  }

  // ── Sérialisation ─────────────────────────────────────────────────────────

  /**
   * Représentation exposable du dossier.
   *
   * La mise en forme appartient à {@link KycMapper} ; seul le point d'accroche
   * reste ici, et il doit y rester : `res.json()` appelle automatiquement
   * `toJSON()`, ce qui protège aussi les chemins indirects — un `Kyc` glissé
   * dans une réponse sans appel explicite, comme le fait `GET /users/me`. Sans
   * cette méthode, il ressortirait avec ses clés privées `_decision`,
   * `_fournisseurRef`…
   */
  toJSON(): KycSnapshot {
    return KycMapper.toSnapshot(this);
  }
}
