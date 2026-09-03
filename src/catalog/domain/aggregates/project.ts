import {
  ChampsDeBloc,
  BlocDeContenuSnapshot,
} from '../entities/bloc-de-contenu';
import { DepotDePhoto, PhotoProjetSnapshot } from '../entities/photo-projet';
import { ModeleEconomique } from '../enums/modele-economique.enum';
import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from '../enums/project-status.enum';
import { ProjectMapper } from '../mappers/project.mapper';
import { BlocsDeContenu } from '../value-objects/blocs-de-contenu.vo';
import {
  CalendrierProjet,
  CalendrierProjetProps,
  CalendrierProjetSnapshot,
} from '../value-objects/calendrier-projet.vo';
import { Chronologie, EtapeChronologie } from '../value-objects/chronologie.vo';
import { GalerieProjet } from '../value-objects/galerie-projet.vo';
import {
  ConditionsFinancieres,
  ConditionsFinancieresProps,
  ConditionsFinancieresSnapshot,
} from '../value-objects/conditions-financieres.vo';
import { Garantie } from '../value-objects/garantie.vo';
import {
  Localisation,
  LocalisationProps,
  LocalisationSnapshot,
} from '../value-objects/localisation.vo';
import { PrevisionnelFinancier } from '../value-objects/previsionnel-financier.vo';
import { StatutProjet } from '../value-objects/statut-projet.vo';

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
  /**
   * L'accroche de la fiche — quelques lignes, affichées en liste et en partage.
   *
   * Distincte de `descriptionMd`, qui est le corps long : le catalogue et les
   * cartes de partage n'ont jamais eu de quoi présenter un projet en une phrase,
   * et tronquaient donc le markdown de la description au caractère près.
   */
  descriptionCourte: string | null;
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
  /** Les pavés éditoriaux de la fiche, dans l'ordre. @see BlocsDeContenu */
  blocsDeContenu: BlocDeContenuSnapshot[];
  /** La galerie : vignette d'abord, puis les vues. @see GalerieProjet */
  photos: PhotoProjetSnapshot[];
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
  | 'descriptionCourte'
  | 'blocsDeContenu'
  | 'photos'
> {
  chronologie?: EtapeChronologie[] | null;
  garanties?: Garantie[] | null;
  modeleEconomique?: ModeleEconomique | null;
  nbUnitesLouables?: number | null;
  broadcastAnnonceAt?: Date | null;
  broadcastCollecteAt?: Date | null;
  descriptionCourte?: string | null;
  blocsDeContenu?: BlocDeContenuSnapshot[] | null;
  photos?: PhotoProjetSnapshot[] | null;
}

/**
 * Ce qu'une mise à jour peut toucher.
 *
 * Le **statut** n'y figure pas, et c'est l'essentiel : `CreateProjectDto` le
 * portait, `UpdateProjectUseCase` recevait un `Partial` de ce DTO, et rien
 * n'empêchait donc un `PATCH /projects/:id` de poser `finance` sans passer par
 * la table des transitions. Un changement d'état se demande à
 * {@link Project.changerStatut}, par la route dédiée.
 *
 * **Les blocs et les photos n'y figurent pas non plus**, et pour la même
 * raison : « remplacer le tableau des blocs » n'est pas une intention métier
 * (§4). L'administrateur en ajoute un, en réécrit un, en déplace un, en retire
 * un — quatre gestes, quatre méthodes, chacune passant par l'invariant de
 * position. Accepter ici un `blocsDeContenu?: []` rouvrirait à un `PATCH` la
 * possibilité d'en poser deux au même rang, ou d'en effacer douze par omission.
 */
export type ModificationProjet = LocalisationProps &
  Partial<ConditionsFinancieresProps> &
  CalendrierProjetProps & {
    titre?: string;
    slug?: string;
    spvId?: string | null;
    type?: ProjectType;
    descriptionCourte?: string | null;
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
 *
 * **Deux suites ordonnées**, enfin, qui sont le contenu de la fiche : ses
 * {@link BlocsDeContenu} — « autant de blocs que l'administrateur le
 * souhaite », chacun avec son titre, son rang et son texte enrichi — et sa
 * {@link GalerieProjet}. Cette dernière vient du contexte `documents`, où elle
 * n'avait pas sa place : une photo de façade ne se signe pas, et l'invariant
 * « une seule vignette par projet » n'y avait aucun propriétaire — il était
 * rattrapé par deux `UPDATE` d'un repository. Les deux suites ne sont
 * modifiables que par les neuf gestes de la section « Contenu éditorial », qui
 * les recomposent entières.
 */
export class Project {
  private _entete: EnteteProjet;
  private _statut: StatutProjet;
  private _localisation: Localisation;
  private _conditions: ConditionsFinancieres;
  private _calendrier: CalendrierProjet;
  private _contenu: ContenuProjet;
  private _blocs: BlocsDeContenu;
  private _galerie: GalerieProjet;
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
    blocs: BlocsDeContenu;
    galerie: GalerieProjet;
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
    this._blocs = etat.blocs;
    this._galerie = etat.galerie;
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
      descriptionCourte,
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
      descriptionCourte:
        descriptionCourte !== undefined
          ? descriptionCourte?.trim() || null
          : this._contenu.descriptionCourte,
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

  // ── Contenu éditorial ─────────────────────────────────────────────────────
  //
  // Neuf gestes, et non un `set` sur deux tableaux. Chacun nomme ce que
  // l'administrateur fait réellement (§4), et chacun repasse par l'invariant de
  // position de la suite concernée — c'est le seul chemin par lequel un bloc ou
  // une photo entre, bouge ou sort. L'agrégat remplace sa suite **après** que la
  // nouvelle a été construite : une opération refusée ne laisse rien derrière
  // elle (§6.1, point 1).

  /**
   * Ajoute un pavé éditorial à la fiche.
   *
   * @param position rang visé ; à défaut, le bloc se pose en dernier.
   * @throws TitreDeBlocRequisError, CorpsDeBlocRequisError,
   *   PositionDeBlocInvalideError
   */
  ajouterBloc(champs: ChampsDeBloc, position?: number): void {
    this._blocs = this._blocs.ajoutant(champs, position);
  }

  /**
   * Réécrit le titre et/ou le texte enrichi d'un bloc.
   *
   * @throws BlocDeContenuIntrouvableError, TitreDeBlocRequisError,
   *   CorpsDeBlocRequisError
   */
  modifierBloc(blocId: string, champs: Partial<ChampsDeBloc>): void {
    this._blocs = this._blocs.modifiant(blocId, champs);
  }

  /** @throws BlocDeContenuIntrouvableError, PositionDeBlocInvalideError */
  deplacerBloc(blocId: string, position: number): void {
    this._blocs = this._blocs.deplacant(blocId, position);
  }

  /**
   * Réordonne la fiche entière — un glisser-déposer du back-office.
   *
   * @throws ReordonnancementIncompletError si la liste n'est pas exactement
   *   celle des blocs de la fiche.
   */
  reordonnerBlocs(idsDansLOrdre: readonly string[]): void {
    this._blocs = this._blocs.reordonnee(idsDansLOrdre);
  }

  /** @throws BlocDeContenuIntrouvableError */
  retirerBloc(blocId: string): void {
    this._blocs = this._blocs.sans(blocId);
  }

  /**
   * Ajoute une photo à la galerie. La première déposée devient la vignette.
   *
   * Le fichier est déjà dans le stockage quand on arrive ici : le domaine ne
   * connaît ni `Buffer`, ni fournisseur (§20, §32).
   *
   * @throws ImageDeProjetInvalideError si le format n'est pas une image
   */
  ajouterPhoto(depot: DepotDePhoto): void {
    this._galerie = this._galerie.ajoutant(depot);
  }

  /**
   * Désigne la vignette du projet : la photo passe en tête de galerie, et
   * l'ancienne cesse d'en être une du seul fait d'avoir reculé.
   *
   * @see GalerieProjet — pourquoi cet invariant ne pouvait pas être tenu tant
   *   que les photos étaient des `SignableDocument`, et pourquoi il n'a plus
   *   besoin d'être « tenu » du tout.
   * @throws PhotoDeProjetIntrouvableError
   */
  designerPhotoPrincipale(photoId: string): void {
    this._galerie = this._galerie.designantCouverture(photoId);
  }

  /**
   * Déplace une photo dans la galerie. Vers le rang 0, c'est en faire la
   * vignette — {@link designerPhotoPrincipale} est le même geste, nommé.
   *
   * @throws PhotoDeProjetIntrouvableError, PositionDePhotoInvalideError
   */
  deplacerPhoto(photoId: string, position: number): void {
    this._galerie = this._galerie.deplacant(photoId, position);
  }

  /** @throws PhotoDeProjetIntrouvableError */
  decrirePhoto(photoId: string, texteAlternatif: string | null): void {
    this._galerie = this._galerie.decrivant(photoId, texteAlternatif);
  }

  /**
   * Retire une photo de la galerie, en promouvant la suivante si c'était la
   * vignette.
   *
   * @returns la clé de stockage qui n'est plus référencée — l'appelant efface
   *   le fichier, l'agrégat ne connaît pas le stockage.
   * @throws PhotoDeProjetIntrouvableError
   */
  retirerPhoto(photoId: string): string {
    const { galerie, cleLiberee } = this._galerie.sans(photoId);
    this._galerie = galerie;
    return cleLiberee;
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
  /**
   * Les suites elles-mêmes ne sortent pas : elles sont immuables, mais les
   * rendre inviterait un appelant à composer sa propre version et à la
   * réinjecter, ce qu'aucune méthode ne permet. Seul l'état sort.
   */
  get blocsDeContenu(): BlocDeContenuSnapshot[] {
    return this._blocs.toSnapshot();
  }
  get photos(): PhotoProjetSnapshot[] {
    return this._galerie.toSnapshot();
  }
  /** La vignette de la fiche — la photo de rang 0 —, ou `null` si la galerie est vide. */
  get photoPrincipale(): PhotoProjetSnapshot | null {
    return this._galerie.toSnapshot()[0] ?? null;
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
  get descriptionCourte(): string | null {
    return this._contenu.descriptionCourte;
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
