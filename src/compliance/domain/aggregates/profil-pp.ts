import { CategoriePsfp } from '../enums/categorie-psfp.enum';
import { ProfilPPMapper } from '../mappers/profil-pp.mapper';
import {
  ChampsCoordonnees,
  Coordonnees,
  CoordonneesSnapshot,
} from '../value-objects/coordonnees.vo';
import {
  ChampsIdentite,
  Identite,
  IdentiteSnapshot,
  IdentiteSnapshotBrut,
} from '../value-objects/identite.vo';
import {
  ChampsSituationFiscale,
  SituationFiscale,
  SituationFiscaleSnapshot,
} from '../value-objects/situation-fiscale.vo';
import {
  ChampsSituationProfessionnelle,
  SituationProfessionnelle,
  SituationProfessionnelleSnapshot,
} from '../value-objects/situation-professionnelle.vo';

/**
 * Tout ce que le titulaire déclare, vu comme un seul formulaire.
 *
 * Le type est **composé** de celui de chaque bloc plutôt qu'écrit à plat :
 * ajouter un champ à l'identité l'ajoute ici sans qu'on y pense, et il devient
 * impossible qu'un champ existe dans le formulaire sans appartenir à un bloc.
 *
 * `undefined` signifie « ne pas toucher », `null` « effacer » — distinction que
 * `Object.assign(profil, dto)` ne savait pas faire.
 */
export type ChampsDeclaresProfilPP = ChampsIdentite &
  ChampsCoordonnees &
  ChampsSituationProfessionnelle &
  ChampsSituationFiscale & {
    /** Personne politiquement exposée — déclaration LCB-FT. */
    pep?: boolean | null;
  };

/** Ce que le profil ajoute à ses blocs : ses clés, le drapeau PEP, ses dates. */
export interface EnteteProfilPP {
  /**
   * Identité propre du dossier, attribuée par la persistance.
   *
   * Le dossier n'en avait pas : sa table avait `utilisateurId` pour clé
   * primaire, si bien que le dossier et son titulaire ne faisaient qu'une
   * seule identité. Deux choses distinctes le méritaient — un compte existe
   * sans dossier (il s'inscrit avant de le remplir), l'inverse n'est pas vrai.
   * La relation 1:1 est désormais portée par la contrainte d'unicité sur
   * `userId`, là où elle se dit, plutôt que par la confusion des deux clés.
   */
  id: string;
  /** Le compte auquel il se rattache — un compte, au plus un dossier. */
  userId: number;
  pep: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * État complet du profil, tel qu'il transite depuis/vers la persistance.
 *
 * Des primitives uniquement, à plat : les Value Objects ne franchissent pas la
 * frontière du domaine (§12.7), et la forme plate est celle de la table. Elle
 * est ici **assemblée** depuis les blocs, de sorte que le découpage interne
 * n'ait aucun effet sur le contrat de persistance ni sur le JSON renvoyé.
 */
export interface ProfilPPSnapshot
  extends
    EnteteProfilPP,
    IdentiteSnapshot,
    CoordonneesSnapshot,
    SituationProfessionnelleSnapshot,
    SituationFiscaleSnapshot {}

/**
 * Ce que `restore` accepte : le snapshot, mais tolérant sur les formes que rend
 * réellement le driver Postgres — chaîne pour une colonne `date`, chaîne pour
 * une colonne `decimal`. Le mapper n'a pas à connaître ces subtilités.
 */
export interface ProfilPPSnapshotBrut
  extends
    EnteteProfilPP,
    IdentiteSnapshotBrut,
    CoordonneesSnapshot,
    SituationProfessionnelleSnapshot,
    SituationFiscaleSnapshot {}

/**
 * Profil investisseur — personne physique.
 *
 * **Une façade sur cinq blocs**, et rien d'autre. Chacun tient un sujet et ses
 * propres invariants :
 *
 * | Bloc                       | Sujet                                    |
 * | -------------------------- | ---------------------------------------- |
 * | `Identite`                 | état civil, naissance, nationalité       |
 * | `Coordonnees`              | adresse postale et téléphone             |
 * | `SituationProfessionnelle` | profession et secteur                    |
 * | `SituationFiscale`         | résidence fiscale et NIF                 |
 *
 * Il en portait un sixième, `EvaluationInvestisseur` — classement PSFP,
 * plafond conseillé, niveau de risque. Il n'y était pas à sa place : ces
 * valeurs ne sont pas déclarées par le titulaire mais **calculées par le
 * questionnaire d'adéquation** (RG-KYC-13), et le profil n'en tenait qu'une
 * copie, écrite par des `UPDATE` ciblés venus d'ailleurs. Pire, une personne
 * morale n'ayant pas de profil PP, elle n'était classée nulle part.
 * `InvestorComplianceProfile` en est désormais le propriétaire, pour les deux
 * natures de titulaire.
 *
 * Ce qui reste ici est ce qui n'appartient à aucun d'eux : la clé du profil, le
 * drapeau PEP, et les **règles qui traversent plusieurs blocs** — au premier
 * chef {@link aRenseigneSonProfil}, qui interroge à la fois l'identité et les
 * coordonnées. Le reste est délégué.
 *
 * Naître et renaître ne sont pas non plus son affaire : `ProfilPPFactory` fait
 * l'un, `ProfilPPMapper` l'autre, et tous deux passent par le constructeur
 * `@internal`. L'agrégat ne garde donc qu'un seul chemin d'écriture,
 * {@link mettreAJour} — ce qui rend la classe lisible d'un trait et permet
 * d'ajouter une projection ou de changer la forme de stockage sans la rouvrir
 * (§4 — SRP).
 *
 * L'agrégat portait auparavant vingt-sept champs à plat, leurs quinze règles de
 * validation et deux invariants croisés sans rapport l'un avec l'autre : le
 * découpage n'ajoute pas de règles, il leur donne un domicile où elles se
 * relisent. Les blocs étant **immuables**, une mise à jour remplace une
 * référence — ce qui rend la détection de changement exacte et gratuite, là où
 * il fallait sérialiser tout le profil pour la deviner.
 *
 * Les attributs restent privés et exposés en lecture seule. Ils étaient publics
 * et mutables : n'importe quel appelant écrivait `profil.categoriePsfp =
 * 'professionnel'` et s'affranchissait du questionnaire d'adéquation.
 */
export class ProfilPP {
  private readonly _id: string;
  private readonly _userId: number;
  private _identite: Identite;
  private _coordonnees: Coordonnees;
  private _situationProfessionnelle: SituationProfessionnelle;
  private _situationFiscale: SituationFiscale;
  private _pep: boolean;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  /**
   * @internal Réservé à `ProfilPPFactory` et `ProfilPPMapper`.
   *
   * Public faute de mieux : TypeScript n'a pas de classe amie, et ces deux-là
   * — qui font respectivement naître et renaître un profil — doivent pouvoir
   * l'appeler. Il n'ouvre rien de plus que les anciens `ProfilPP.creer` et
   * `ProfilPP.restore`, publics eux aussi. Il reste qu'il n'éprouve rien :
   * passer par ici, c'est se déclarer fabrique ou mapper, et prendre à sa
   * charge les invariants que l'un pose et que l'autre assume de ne pas
   * rejouer.
   */
  constructor(etat: {
    entete: EnteteProfilPP;
    identite: Identite;
    coordonnees: Coordonnees;
    situationProfessionnelle: SituationProfessionnelle;
    situationFiscale: SituationFiscale;
  }) {
    this._id = etat.entete.id;
    this._userId = etat.entete.userId;
    this._pep = etat.entete.pep;
    this._createdAt = etat.entete.createdAt;
    this._updatedAt = etat.entete.updatedAt;
    this._identite = etat.identite;
    this._coordonnees = etat.coordonnees;
    this._situationProfessionnelle = etat.situationProfessionnelle;
    this._situationFiscale = etat.situationFiscale;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Met à jour les champs déclarés, aux mêmes conditions qu'à la création.
   *
   * Remplace `Object.assign(profil, dto)`, qui recopiait le DTO sans le
   * traduire : la date de naissance atterrissait sous forme de chaîne dans un
   * champ typé `Date`, et rien n'empêchait d'y glisser une clé que le domaine
   * ne connaît pas — `categoriePsfp`, par exemple. Ici chaque bloc reçoit sa
   * part et n'y prend que ce qui le concerne.
   *
   * Le remplacement des blocs est **atomique** : ils sont tous construits avant
   * la moindre affectation, donc un champ refusé par le troisième bloc laisse
   * le profil exactement dans l'état où il était.
   *
   * @returns `true` si au moins un champ a changé — utile à l'appelant qui veut
   *   éviter une écriture inutile ou tracer la modification.
   */
  mettreAJour(champs: ChampsDeclaresProfilPP): boolean {
    const identite = this._identite.avec(champs);
    const coordonnees = this._coordonnees.avec(champs);
    const situationProfessionnelle =
      this._situationProfessionnelle.avec(champs);
    const situationFiscale = this._situationFiscale.avec(champs);
    const pep = champs.pep === undefined ? this._pep : champs.pep === true;

    const change =
      !this._identite.equals(identite) ||
      !this._coordonnees.equals(coordonnees) ||
      !this._situationProfessionnelle.equals(situationProfessionnelle) ||
      !this._situationFiscale.equals(situationFiscale) ||
      this._pep !== pep;

    this._identite = identite;
    this._coordonnees = coordonnees;
    this._situationProfessionnelle = situationProfessionnelle;
    this._situationFiscale = situationFiscale;
    this._pep = pep;

    return change;
  }

  // ── Règles propres au profil ──────────────────────────────────────────────

  /**
   * Le titulaire a-t-il commencé à renseigner son profil ?
   *
   * Nationalité, date de naissance et adresse sont les trois données que le KYC
   * exige ; en tenir une seule prouve que le formulaire a été ouvert et rempli.
   * La règle traverse deux blocs — c'est ce qui la fait rester ici. Elle
   * décidait de l'avancement affiché à l'utilisateur depuis un contrôleur, où
   * le métier n'a rien à faire (§12.5).
   */
  aRenseigneSonProfil(): boolean {
    return (
      this._identite.nationalite !== null ||
      this._identite.dateNaissance !== null ||
      this._coordonnees.estRenseignee()
    );
  }

  /** Personne politiquement exposée — surveillance LCB-FT renforcée. */
  estPep(): boolean {
    return this._pep;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get id(): string {
    return this._id;
  }
  get userId(): number {
    return this._userId;
  }
  get identite(): Identite {
    return this._identite;
  }
  get coordonnees(): Coordonnees {
    return this._coordonnees;
  }
  get situationProfessionnelle(): SituationProfessionnelle {
    return this._situationProfessionnelle;
  }
  get situationFiscale(): SituationFiscale {
    return this._situationFiscale;
  }
  get pep(): boolean {
    return this._pep;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ── Sérialisation ─────────────────────────────────────────────────────────

  /**
   * Représentation exposable du profil.
   *
   * La mise en forme appartient à {@link ProfilPPMapper} ; seul le point
   * d'accroche reste ici, et il doit y rester : `res.json()` appelle
   * automatiquement `toJSON()`, ce qui protège aussi les chemins de
   * sérialisation indirects — un `ProfilPP` glissé dans une réponse sans appel
   * explicite. Sans cette méthode, il ressortirait avec ses blocs internes
   * `_identite`, `_coordonnees`… Les clés publiées sont exactement celles
   * d'avant le découpage : le front n'a rien à changer.
   */
  toJSON(): ProfilPPSnapshot {
    return ProfilPPMapper.toSnapshot(this);
  }
}
