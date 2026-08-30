import { CreateProjectUseCase } from './create-project.usecase';
import { CreateProjectDto } from 'src/projects/presenters/dto/project.dto';
import { Project } from 'src/projects/domains/project';
import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';
import { ProjectMapper } from 'src/projects/infrastructure/persistences/mappers/project.mapper';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';

/**
 * Activation du commutateur de modèle économique — création.
 *
 * Le champ `modeleEconomique` existait en base et en domaine, mais n'était
 * écrit par aucun use case : tout projet naissait obligataire et la chaîne
 * equity (distributions de loyers, sortie par cession) était structurellement
 * inatteignable. Ces tests prouvent que la valeur traverse désormais le use
 * case ET la persistance.
 *
 * Le dépôt en mémoire rejoue la traversée réelle de `saveProject` :
 * `ProjectMapper.toEntity()` puis `ProjectMapper.toDomain()`, avec le DEFAULT
 * de colonne simulé. Le use case est donc testé contre le vrai mapper, sans
 * base de données — si le mapper réécrivait la valeur, ces tests tomberaient.
 */
class InMemoryProjectRepository {
  /** Dernière entité « persistée », telle qu'elle partirait vers Postgres. */
  lastEntity: ProjectEntity | null = null;

  saveProject = jest.fn(async (project: Project): Promise<Project> => {
    const entity = ProjectMapper.toEntity(project);
    this.lastEntity = entity;
    // Simulation du DEFAULT de colonne : `@Column({ default: OBLIGATAIRE })`.
    // Une colonne laissée intacte par le mapper reçoit la valeur par défaut
    // à l'INSERT, jamais NULL.
    const persisted = Object.assign(new ProjectEntity(), entity);
    if (persisted.modeleEconomique === undefined) {
      persisted.modeleEconomique = ModeleEconomique.OBLIGATAIRE;
    }
    return ProjectMapper.toDomain(persisted);
  });

  findProjectBySlug = jest.fn(async () => null);
  findOffresPorteurDepuis = jest.fn(async () => []);
}

describe('CreateProjectUseCase — modèle économique', () => {
  let repo: InMemoryProjectRepository;
  let conflitsInterets: any;
  let useCase: CreateProjectUseCase;

  const dtoBase = (): CreateProjectDto =>
    ({
      titre: 'Résidence Les Jardins',
      type: ProjectType.RESIDENTIEL,
      capitalCible: 600_000,
      capitalMinimum: 360_000,
      dureeMois: 36,
      instrument: ProjectInstrument.PART_SOCIALE,
    }) as CreateProjectDto;

  beforeEach(() => {
    repo = new InMemoryProjectRepository();
    conflitsInterets = { assertPorteurEligible: jest.fn(async () => undefined) };
    useCase = new CreateProjectUseCase(repo as any, conflitsInterets);
  });

  it('propage `equity` jusqu\'à la persistance : le projet ressort `equity` du dépôt', async () => {
    const projet = await useCase.execute({
      ...dtoBase(),
      modeleEconomique: ModeleEconomique.EQUITY,
    });

    expect(projet.modeleEconomique).toBe(ModeleEconomique.EQUITY);
    // Et la valeur est bien celle envoyée à la couche de persistance, pas une
    // valeur reconstruite à la lecture.
    expect(repo.lastEntity?.modeleEconomique).toBe(ModeleEconomique.EQUITY);
  });

  it('applique `obligataire` quand le champ est absent du corps de la requête', async () => {
    const projet = await useCase.execute(dtoBase());

    expect(projet.modeleEconomique).toBe(ModeleEconomique.OBLIGATAIRE);
    expect(repo.lastEntity?.modeleEconomique).toBe(
      ModeleEconomique.OBLIGATAIRE,
    );
  });

  it('propage `obligataire` explicitement demandé', async () => {
    const projet = await useCase.execute({
      ...dtoBase(),
      modeleEconomique: ModeleEconomique.OBLIGATAIRE,
    });

    expect(projet.modeleEconomique).toBe(ModeleEconomique.OBLIGATAIRE);
  });

  it("n'altère aucun autre champ du projet créé", async () => {
    const projet = await useCase.execute({
      ...dtoBase(),
      modeleEconomique: ModeleEconomique.EQUITY,
    });

    expect(projet.titre).toBe('Résidence Les Jardins');
    expect(projet.slug).toBe('residence-les-jardins');
    expect(projet.instrument).toBe(ProjectInstrument.PART_SOCIALE);
    expect(projet.statut).toBe(ProjectStatus.BROUILLON);
    expect(projet.capitalCible).toBe(600_000);
  });
});
