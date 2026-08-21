import { ModeleEconomique } from './enums/modele-economique.enum';
import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from './enums/project-status.enum';
import { ProjectMapper } from './mappers/project.mapper';
import {
  CalendrierProjet,
  CalendrierProjetProps,
  CalendrierProjetSnapshot,
} from './value-objects/calendrier-projet.vo';
import { Chronologie, EtapeChronologie } from './value-objects/chronologie.vo';
import {
  ConditionsFinancieres,
  ConditionsFinancieresProps,
  ConditionsFinancieresSnapshot,
} from './value-objects/conditions-financieres.vo';
import { Garantie } from './value-objects/garantie.vo';
import {
  Localisation,
  LocalisationProps,
  LocalisationSnapshot,
} from './value-objects/localisation.vo';
import { PrevisionnelFinancier } from './value-objects/previsionnel-financier.vo';
import { StatutProjet } from './value-objects/statut-projet.vo';

/** Ce que le projet ajoute à ses blocs : sa clé, son adresse publique, ses dates. */
export interface EnteteProjet {
  id: string;
  slug: string;
  titre: string;
  type: ProjectType;
  spvId: string | null;
  porteurId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Horodatages anti-doublon des diffusions email/SMS.
 *
 * Posés par `BroadcastService` (contexte Notifications) au moyen d'un `UPDATE`
 * ciblé et conditionnel — c'est ce claim atomique qui garantit qu'une campagne
 * ne part qu'une fois, même si l'action admin est rejouée. L'agrégat les
 * transporte en lecture seule : aucune règle de ce contexte ne les décide, et
 * il ne doit surtout pas les réécrire (voir `ProjectOrmMapper.toEntity`).
 */
export interface DiffusionsProjet {
  broadcastAnnonceAt: Date | null;
  broadcastCollecteAt: Date | null;
}

/** Contenu éditorial publié sur la fiche projet. */
export interface ContenuProjet {
  descriptionMd: string | null;
  avertissementMd: string | null;
  youtubeUrl: string | null;
  previsionnel: PrevisionnelFinancier | null;
  garanties: Garantie[];
}

/**
 * État complet du projet, tel qu'il transite depuis/vers la persistance et tel
 * qu'il est publié en JSON.
 *
 * Des primitives à plat : les Value Objects ne franchissent pas la frontière du
 * domaine (§12.7), et la forme plate est à la fois celle de la table et celle
 * que le front reçoit aujourd'hui. **Les clés sont exactement celles publiées
 * avant le découpage** — `GET /projects`, `GET /projects/public`,
 * `GET /projects/:id` et les réponses de création/mise à jour rendent le même
 * JSON.
 */
export interface ProjectSnapshot
  extends
    EnteteProjet,
    LocalisationSnapshot,
    ConditionsFinancieresSnapshot,
    CalendrierProjetSnapshot,
    ContenuProjet,
    DiffusionsProjet {
  statut: ProjectStatus;
  chronologie: EtapeChronologie[];
  modeleEconomique: ModeleEconomique;
  nbUnitesLouables: number | null;
}

/**
 * Ce que `restore` accepte : le snapshot, mais tolérant sur les colonnes qu'un
 * `save()` ne relit pas — TypeORM rend l'entité qu'on lui a passée, donc sans
 * les colonnes qu'elle n'a pas écrites — et sur les défauts posés en base.
 */
export interface ProjectSnapshotBrut extends Omit<
  ProjectSnapshot,
  | 'chronologie'
  | 'garanties'
  | 'modeleEconomique'
  | 'nbUnitesLouables'
  | 'broadcastAnnonceAt'
  | 'broadcastCollecteAt'
> {
  chronologie?: EtapeChronologie[] | null;
  garanties?: Garantie[] | null;
  modeleEconomique?: ModeleEconomique | null;
  nbUnitesLouables?: number | null;
  broadcastAnnonceAt?: Date | null;
  broadcastCollecteAt?: Date | null;
}

/**
 * Ce qu'une mise à jour peut toucher.
 *
 * Le **statut** n'y figure pas, et c'est l'essentiel : `CreateProjectDto` le
 * portait, `UpdateProjectUseCase` recevait un `Partial` de ce DTO, et rien
 * n'empêchait donc un `PATCH /projects/:id` de poser `finance` sans passer par
 * la table des transitions. Un changement d'état se demande à
 * {@link Project.changerStatut}, par la route dédiée.
 */
export type ModificationProjet = LocalisationProps &
  Partial<ConditionsFinancieresProps> &
  CalendrierProjetProps & {
    titre?: string;
    slug?: string;
    spvId?: string | null;
    type?: ProjectType;
    descriptionMd?: string | null;
    avertissementMd?: string | null;
    youtubeUrl?: string | null;
    previsionnel?: PrevisionnelFinancier | null;
    chronologie?: EtapeChronologie[] | null;
    garanties?: Garantie[] | null;
  };

/**
 * Opération immobilière ouverte au financement participatif.
 *
 * L'agrégat était une classe à trente attributs publics et mutables, sans
 * constructeur. Le faire naître, c'était écrire `new Project()` puis trente
 * affectations dans `CreateProjectUseCase` ; le modifier, quarante
 * `if (dto.x !== undefined)` dans `UpdateProjectUseCase`, dont trois passaient
 * par `(project as any)` pour atteindre des champs que le DTO ne déclarait pas.
 * Les deux listes ne s'accordaient déjà plus : la création posait `pays = 'FR'`,
 * la mise à jour `'CI'`.
 *
 * Naître appartient désormais à {@link ProjectFactory}, renaître à
 * {@link ProjectMapper}, tous deux passant par le constructeur `@internal`.
 *
 * **Trois blocs**, et trois seulement — ceux dont les champs se contraignent
 * réellement entre eux : {@link Localisation} (une coordonnée se donne
 * entière), {@link ConditionsFinancieres} (capital minimum sous le capital
 * cible, ticket maximum au-dessus du minimum…) et {@link CalendrierProjet}
 * (publication, puis collecte, puis clôture). Le titre, le slug, le porteur, la
 * SPV, le modèle économique restent à plat : ce sont des valeurs indépendantes,
 * et les empaqueter produirait un bloc nommé d'après rien.
 *
 * **Deux transitions**, et elles sont les seules manières de changer d'état :
 * {@link changerStatut}, qui consulte la table du cycle de vie et estampille
 * les jalons de publication au passage, et {@link modifier}, qui recompose et
 * revalide les blocs touchés. Le statut ne se pose plus « à la main » depuis un
 * DTO, et les dates de publication ne sont plus décidées par le repository
 * TypeORM.
 */
export class Project {
  private _entete: EnteteProjet;
  private _statut: StatutProjet;
  private _localisation: Localisation;
  private _conditions: ConditionsFinancieres;
  private _calendrier: CalendrierProjet;
  private _contenu: ContenuProjet;
  private _chronologie: Chronologie;
  private readonly _modeleEconomique: ModeleEconomique;
  private readonly _nbUnitesLouables: number | null;
  private readonly _diffusions: DiffusionsProjet;

  /**
   * @internal Réservé à `ProjectFactory` et `ProjectMapper`.
   *
   * Public faute de mieux : TypeScript n'a pas de classe amie, et ces deux-là
   * — qui font respectivement naître et renaître un projet — doivent pouvoir
   * l'appeler. Il n'éprouve rien : passer par ici, c'est se déclarer fabrique
   * ou mapper, et prendre à sa charge les invariants que l'une pose et que
   * l'autre assume de ne pas rejouer.
   */
  constructor(etat: {
    entete: EnteteProjet;
    statut: StatutProjet;
    localisation: Localisation;
    conditions: ConditionsFinancieres;
    calendrier: CalendrierProjet;
    contenu: ContenuProjet;
    chronologie: Chronologie;
    modeleEconomique: ModeleEconomique;
    nbUnitesLouables: number | null;
    diffusions: DiffusionsProjet;
  }) {
    this._entete = etat.entete;
    this._statut = etat.statut;
    this._localisation = etat.localisation;
    this._conditions = etat.conditions;
    this._calendrier = etat.calendrier;
    this._contenu = etat.contenu;
    this._chronologie = etat.chronologie;
    this._modeleEconomique = etat.modeleEconomique;
    this._nbUnitesLouables = etat.nbUnitesLouables;
    this._diffusions = etat.diffusions;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Fait avancer le projet dans son cycle de vie, et pose au passage les jalons
   * que ce nouvel état implique.
   *
   * Les deux règles étaient séparées : la table des transitions dans
   * `UpdateProjectStatusUseCase`, l'estampillage des dates dans
   * `ProjectTypeOrmRepository.updateProjectStatus`. Un adapter de sortie
   * décidait donc d'une date métier, et pouvait le faire sur une transition que
   * la table interdisait — rien ne les faisait passer par le même point.
   *
   * @throws TransitionStatutProjetInvalideError
   */
  changerStatut(vise: ProjectStatus, maintenant = new Date()): void {
    this._statut = this._statut.allerVers(vise);
    if (vise === ProjectStatus.EN_COLLECTE) {
      this._calendrier = this._calendrier.auPassageEnCollecte(maintenant);
    } else if (vise === ProjectStatus.ANNONCE) {
      this._calendrier = this._calendrier.auPassageEnAnnonce(maintenant);
    }
  }

  /**
   * Clôture le projet à la suite d'une sortie exécutée.
   *
   * @see StatutProjet.cloturerApresSortie — pourquoi ce chemin est distinct.
   */
  cloturerApresSortie(): void {
    this._statut = this._statut.cloturerApresSortie();
  }

  /**
   * Applique une modification partielle : `undefined` laisse le champ en
   * place, `null` l'efface, et chaque bloc touché est revalidé **entier**.
   */
  modifier(modification: ModificationProjet): void {
    const {
      titre,
      slug,
      spvId,
      type,
      descriptionMd,
      avertissementMd,
      youtubeUrl,
      previsionnel,
      chronologie,
      garanties,
      ...blocs
    } = modification;

    if (titre !== undefined) this._entete = { ...this._entete, titre };
    if (slug !== undefined) this._entete = { ...this._entete, slug };
    if (spvId !== undefined) this._entete = { ...this._entete, spvId };
    if (type !== undefined) this._entete = { ...this._entete, type };

    this._localisation = this._localisation.avec(blocs);
    this._conditions = this._conditions.avec(blocs);
    this._calendrier = this._calendrier.avec(blocs);

    this._contenu = {
      descriptionMd:
        descriptionMd !== undefined
          ? descriptionMd
          : this._contenu.descriptionMd,
      avertissementMd:
        avertissementMd !== undefined
          ? avertissementMd
          : this._contenu.avertissementMd,
      youtubeUrl:
        youtubeUrl !== undefined ? youtubeUrl : this._contenu.youtubeUrl,
      previsionnel:
        previsionnel !== undefined ? previsionnel : this._contenu.previsionnel,
      garanties:
        garanties !== undefined ? (garanties ?? []) : this._contenu.garanties,
    };

    if (chronologie !== undefined) {
      this._chronologie = Chronologie.restore(chronologie);
    }
  }

  /**
   * Recalcule l'avancement de la chronologie au jour dit.
   *
   * @returns `true` si un jalon a changé d'état — c'est ce qui décide de
   *   l'écriture en base, le CRON balayant tous les projets ouverts chaque
   *   matin.
   */
  avancerChronologieAu(jour: Date): boolean {
    const avancee = this._chronologie.avancerAu(jour);
    if (!avancee.differeDe(this._chronologie)) return false;
    this._chronologie = avancee;
    return true;
  }

  // ── Règles propres au projet ──────────────────────────────────────────────

  /** @see StatutProjet.estBrouillon */
  estBrouillon(): boolean {
    return this._statut.estBrouillon;
  }

  /** @see StatutProjet.estPublic */
  estVisiblePubliquement(): boolean {
    return this._statut.estPublic;
  }

  /** @see StatutProjet.estOuvertAuxInvestisseurs */
  estOuvertAuxInvestisseurs(): boolean {
    return this._statut.estOuvertAuxInvestisseurs;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get id(): string {
    return this._entete.id;
  }
  get slug(): string {
    return this._entete.slug;
  }
  get titre(): string {
    return this._entete.titre;
  }
  get type(): ProjectType {
    return this._entete.type;
  }
  get spvId(): string | null {
    return this._entete.spvId;
  }
  get porteurId(): number | null {
    return this._entete.porteurId;
  }
  get createdAt(): Date {
    return this._entete.createdAt;
  }
  get updatedAt(): Date {
    return this._entete.updatedAt;
  }
  get statut(): ProjectStatus {
    return this._statut.valeur;
  }
  get localisation(): Localisation {
    return this._localisation;
  }
  get conditions(): ConditionsFinancieres {
    return this._conditions;
  }
  get calendrier(): CalendrierProjet {
    return this._calendrier;
  }
  get contenu(): ContenuProjet {
    return this._contenu;
  }
  get chronologieVo(): Chronologie {
    return this._chronologie;
  }
  get modeleEconomique(): ModeleEconomique {
    return this._modeleEconomique;
  }
  get nbUnitesLouables(): number | null {
    return this._nbUnitesLouables;
  }
  get diffusions(): DiffusionsProjet {
    return { ...this._diffusions };
  }

  // ── Délégations ───────────────────────────────────────────────────────────
  //
  // Ce que les autres contextes lisent réellement sur un projet — Investments,
  // Reservations, Distributions, Locative Management et les contrôleurs
  // d'administration accèdent tous à ces champs à plat. Les exposer ici évite
  // de leur imposer la connaissance des blocs, et garde leurs appels
  // inchangés.

  get ville(): string | null {
    return this._localisation.ville;
  }
  get region(): string | null {
    return this._localisation.region;
  }
  get pays(): string {
    return this._localisation.pays;
  }
  get adresseComplete(): string | null {
    return this._localisation.adresseComplete;
  }
  get latitude(): number | null {
    return this._localisation.latitude;
  }
  get longitude(): number | null {
    return this._localisation.longitude;
  }
  get capitalCible(): number {
    return this._conditions.capitalCible;
  }
  get capitalMinimum(): number {
    return this._conditions.capitalMinimum;
  }
  get ticketMinimum(): number {
    return this._conditions.ticketMinimum;
  }
  get ticketMaximum(): number | null {
    return this._conditions.ticketMaximum;
  }
  get triCible(): number | null {
    return this._conditions.triCible;
  }
  get indiceRisque(): number {
    return this._conditions.indiceRisque;
  }
  get dureeMois(): number {
    return this._conditions.dureeMois;
  }
  get instrument(): ProjectInstrument {
    return this._conditions.instrument;
  }
  get estPreInvestissable(): boolean {
    return this._conditions.estPreInvestissable;
  }
  get plafondPreInvestissement(): number | null {
    return this._conditions.plafondPreInvestissement;
  }
  get nbFractions(): number | null {
    return this._conditions.nbFractions;
  }
  get prixFraction(): number | null {
    return this._conditions.prixFraction;
  }
  /** @see ConditionsFinancieres.nbFractionsTotal */
  get nbFractionsTotal(): number {
    return this._conditions.nbFractionsTotal;
  }
  /** @see ConditionsFinancieres.prixUnitaireFraction */
  get prixUnitaireFraction(): number {
    return this._conditions.prixUnitaireFraction;
  }
  get datePublication(): Date | null {
    return this._calendrier.datePublication;
  }
  get dateOuvertureCollecte(): Date | null {
    return this._calendrier.dateOuvertureCollecte;
  }
  get dateCloturePrevue(): Date | null {
    return this._calendrier.dateCloturePrevue;
  }
  get descriptionMd(): string | null {
    return this._contenu.descriptionMd;
  }
  get avertissementMd(): string | null {
    return this._contenu.avertissementMd;
  }
  get youtubeUrl(): string | null {
    return this._contenu.youtubeUrl;
  }
  get previsionnel(): PrevisionnelFinancier | null {
    return this._contenu.previsionnel;
  }
  get garanties(): Garantie[] {
    return this._contenu.garanties;
  }
  get chronologie(): EtapeChronologie[] {
    return this._chronologie.toSnapshot();
  }
  get broadcastAnnonceAt(): Date | null {
    return this._diffusions.broadcastAnnonceAt;
  }
  get broadcastCollecteAt(): Date | null {
    return this._diffusions.broadcastCollecteAt;
  }

  // ── Sérialisation ─────────────────────────────────────────────────────────

  /**
   * Représentation exposable du projet.
   *
   * La mise en forme appartient à {@link ProjectMapper} ; seul le point
   * d'accroche reste ici, et il doit y rester : `res.json()` appelle
   * automatiquement `toJSON()`, ce qui protège aussi les chemins indirects — un
   * `Project` glissé dans une réponse sans appel explicite, comme le fait
   * `GET /porteur/projects` du contexte Locative Management. Sans cette
   * méthode, il ressortirait avec ses clés privées `_conditions`,
   * `_localisation`…
   *
   * ⚠️ `toJSON()` ne suffit **pas** à l'opérateur de décomposition :
   * `{ ...project }` rend les champs privés, pas le snapshot. Les composeurs de
   * read-model doivent appeler `toSnapshot()` explicitement.
   */
  toJSON(): ProjectSnapshot {
    return this.toSnapshot();
  }

  toSnapshot(): ProjectSnapshot {
    return ProjectMapper.toSnapshot(this);
  }
}
