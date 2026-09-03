import { ModeleEconomique } from '../enums/modele-economique.enum';
import { ProjectStatus, ProjectType } from '../enums/project-status.enum';
import { ChampProjetInvalideError } from '../errors/project.errors';
import { Project } from '../aggregates/project';
import { BlocsDeContenu } from '../value-objects/blocs-de-contenu.vo';
import { CalendrierProjet } from '../value-objects/calendrier-projet.vo';
import { Chronologie, EtapeChronologie } from '../value-objects/chronologie.vo';
import {
  ConditionsFinancieres,
  ConditionsFinancieresProps,
} from '../value-objects/conditions-financieres.vo';
import { GalerieProjet } from '../value-objects/galerie-projet.vo';
import { Garantie } from '../value-objects/garantie.vo';
import {
  Localisation,
  LocalisationProps,
} from '../value-objects/localisation.vo';
import { PrevisionnelFinancier } from '../value-objects/previsionnel-financier.vo';
import { StatutProjet } from '../value-objects/statut-projet.vo';

/** Ce qu'il faut pour ouvrir un dossier de projet. Le reste est décidé ici. */
export type CreerProjetProps = LocalisationProps &
  ConditionsFinancieresProps & {
    titre: string;
    type: ProjectType;
    /** À défaut, dérivé du titre — voir {@link ProjectFactory.slugDepuisTitre}. */
    slug?: string | null;
    spvId?: string | null;
    /** Renseigné quand un porteur soumet son propre dossier. */
    porteurId?: number | null;
    datePublication?: Date | string | null;
    dateOuvertureCollecte?: Date | string | null;
    dateCloturePrevue?: Date | string | null;
    descriptionCourte?: string | null;
    descriptionMd?: string | null;
    avertissementMd?: string | null;
    youtubeUrl?: string | null;
    previsionnel?: PrevisionnelFinancier | null;
    chronologie?: EtapeChronologie[] | null;
    garanties?: Garantie[] | null;
    modeleEconomique?: ModeleEconomique | null;
    nbUnitesLouables?: number | null;
    /**
     * Statut de départ. Seuls `BROUILLON` et `ANNONCE` sont recevables — voir
     * {@link ProjectFactory.creer}.
     */
    statut?: ProjectStatus | null;
  };

/**
 * Ouverture d'un dossier de projet.
 *
 * Même rôle que `KycFactory` : rassembler ce qui est décidé à la naissance,
 * pour que ce soit décidé **une fois**. Ces choix vivaient dans les trente
 * affectations de `CreateProjectUseCase`, et le contrôleur en reprenait une
 * partie à sa façon pour la soumission par un porteur.
 *
 * Ce que la fabrique décide, et qu'aucun appelant ne peut donc contredire :
 *
 * - le **slug**, dérivé du titre à défaut d'être fourni. C'est l'adresse
 *   publique du projet et la colonne est `unique` : la dériver ici garantit
 *   qu'elle est toujours normalisée de la même manière, quel que soit le point
 *   d'entrée ;
 * - le **statut de départ**, restreint. C'est l'invariant qui compte ici :
 *   `CreateProjectDto.statut` acceptait les neuf valeurs de l'énumération, si
 *   bien qu'un projet pouvait naître `FINANCE` — donc afficher une collecte
 *   réussie qui n'a jamais eu lieu — ou `CLOTURE`, c'est-à-dire mort-né dans un
 *   état terminal d'où la table des transitions ne le sortirait plus jamais ;
 * - l'absence de **diffusions** : les horodatages anti-doublon appartiennent à
 *   `BroadcastService`, et un projet qui naîtrait avec en désignerait une
 *   campagne qui n'a jamais été envoyée ;
 * - le **modèle économique** par défaut, `OBLIGATAIRE`, comme le `default` de
 *   la colonne.
 *
 * Une classe à méthodes statiques, sans `@Injectable` : elle ne dépend de rien,
 * et un décorateur NestJS introduirait dans le domaine une dépendance de
 * framework que rien ne justifie (§12.1).
 */
export class ProjectFactory {
  /**
   * Statuts recevables à la naissance.
   *
   * `BROUILLON` est le cas courant — création admin comme soumission porteur.
   * `ANNONCE` est conservé parce que la création admin l'utilise pour publier
   * d'emblée : c'est la première case de la table des transitions, et le
   * contrôleur diffuse déjà l'annonce dans la foulée.
   */
  static readonly STATUTS_INITIAUX: readonly ProjectStatus[] = [
    ProjectStatus.BROUILLON,
    ProjectStatus.ANNONCE,
  ];

  static creer(props: CreerProjetProps): Project {
    const titre = props.titre?.trim();
    if (!titre) {
      throw new ChampProjetInvalideError('titre', 'obligatoire.');
    }

    const slug = props.slug?.trim() || ProjectFactory.slugDepuisTitre(titre);
    if (!slug) {
      throw new ChampProjetInvalideError(
        'slug',
        'le titre ne produit aucun slug lisible — fournissez-en un explicitement.',
      );
    }

    const statut = props.statut ?? ProjectStatus.BROUILLON;
    if (!ProjectFactory.STATUTS_INITIAUX.includes(statut)) {
      throw new ChampProjetInvalideError(
        'statut',
        `un projet naît ${ProjectFactory.STATUTS_INITIAUX.join(' ou ')} ; « ${statut} » se demande ensuite par la route de changement de statut.`,
      );
    }

    return new Project({
      entete: {
        // Attribués par la persistance — l'`id` est un uuid généré en base.
        id: undefined as unknown as string,
        createdAt: undefined as unknown as Date,
        updatedAt: undefined as unknown as Date,
        slug,
        titre,
        type: props.type,
        spvId: props.spvId ?? null,
        porteurId: props.porteurId ?? null,
      },
      statut: StatutProjet.restore(statut),
      localisation: Localisation.of(props),
      conditions: ConditionsFinancieres.of(props),
      calendrier: CalendrierProjet.of(props),
      contenu: {
        descriptionCourte: props.descriptionCourte?.trim() || null,
        descriptionMd: props.descriptionMd ?? null,
        avertissementMd: props.avertissementMd ?? null,
        youtubeUrl: props.youtubeUrl ?? null,
        previsionnel: props.previsionnel ?? null,
        garanties: props.garanties ?? [],
      },
      // Un projet naît sans contenu éditorial : les blocs se rédigent et les
      // photos se déposent ensuite, un par un, par les routes dédiées. Les
      // accepter ici demanderait de tirer des identifiants pour un contenu que
      // personne n'a encore écrit.
      blocs: BlocsDeContenu.vide(),
      galerie: GalerieProjet.vide(),
      chronologie: Chronologie.restore(props.chronologie),
      modeleEconomique: props.modeleEconomique ?? ModeleEconomique.OBLIGATAIRE,
      nbUnitesLouables: props.nbUnitesLouables ?? null,
      diffusions: { broadcastAnnonceAt: null, broadcastCollecteAt: null },
    });
  }

  /**
   * Adresse publique dérivée du titre : minuscules, accents dépliés,
   * ponctuation retirée, espaces en tirets.
   *
   * Reprise telle quelle de `CreateProjectUseCase.generateSlug`, à un détail
   * près : le `trim()` y était appliqué **après** la conversion des espaces en
   * tirets, donc n'enlevait rien — « Résidence Les Arcs » produisait
   * `residence-les-arcs`, mais «  Résidence  » produisait `-residence-`. Le
   * découpage se fait maintenant avant, et les tirets de bord sont retirés.
   */
  static slugDepuisTitre(titre: string): string {
    return titre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
