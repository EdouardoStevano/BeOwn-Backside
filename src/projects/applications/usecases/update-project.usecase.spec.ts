import { UpdateProjectUseCase } from './update-project.usecase';
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
 * Activation du commutateur de modèle économique — mise à jour.
 *
 * Comme pour la création, le dépôt en mémoire rejoue la traversée réelle de
 * `saveProject` (`toEntity` puis `toDomain`) : la valeur est vérifiée APRÈS le
 * mapper, là où le `?? OBLIGATAIRE` d'écriture la réécrivait auparavant.
 */
class InMemoryProjectRepository {
  lastEntity: ProjectEntity | null = null;

  constructor(private readonly stored: Project) {}

  findProjectById = jest.fn(async (id: string) =>
    id === this.stored.id ? this.stored : null,
  );

  saveProject = jest.fn(async (project: Project): Promise<Project> => {
    const entity = ProjectMapper.toEntity(project);
    this.lastEntity = entity;
    const persisted = Object.assign(new ProjectEntity(), entity);
    if (persisted.modeleEconomique === undefined) {
      persisted.modeleEconomique = ModeleEconomique.OBLIGATAIRE;
    }
    return ProjectMapper.toDomain(persisted);
  });

  findOffresPorteurDepuis = jest.fn(async () => []);
}

const projetStocke = (modele: ModeleEconomique): Project => {
  const p = new Project();
  p.id = 'proj-1';
  p.slug = 'residence-les-jardins';
  p.titre = 'Résidence Les Jardins';
  p.spvId = null;
  p.porteurId = null;
  p.type = ProjectType.RESIDENTIEL;
  p.pays = 'FR';
  p.capitalCible = 600_000;
  p.capitalMinimum = 360_000;
  p.ticketMinimum = 100;
  p.ticketMaximum = null;
  p.triCible = 9;
  p.indiceRisque = 3;
  p.dureeMois = 36;
  p.instrument = ProjectInstrument.PART_SOCIALE;
  p.statut = ProjectStatus.BROUILLON;
  p.estPreInvestissable = false;
  p.plafondPreInvestissement = null;
  p.nbFractions = 6_000;
  p.prixFraction = 100;
  p.modeleEconomique = modele;
  return p;
};

describe('UpdateProjectUseCase — modèle économique', () => {
  it('bascule un projet obligataire en equity et la valeur survit à la persistance', async () => {
    const repo = new InMemoryProjectRepository(
      projetStocke(ModeleEconomique.OBLIGATAIRE),
    );
    const useCase = new UpdateProjectUseCase(repo as any);

    const projet = await useCase.execute('proj-1', {
      modeleEconomique: ModeleEconomique.EQUITY,
    });

    expect(projet.modeleEconomique).toBe(ModeleEconomique.EQUITY);
    expect(repo.lastEntity?.modeleEconomique).toBe(ModeleEconomique.EQUITY);
  });

  it('bascule un projet equity en obligataire', async () => {
    const repo = new InMemoryProjectRepository(
      projetStocke(ModeleEconomique.EQUITY),
    );
    const useCase = new UpdateProjectUseCase(repo as any);

    const projet = await useCase.execute('proj-1', {
      modeleEconomique: ModeleEconomique.OBLIGATAIRE,
    });

    expect(projet.modeleEconomique).toBe(ModeleEconomique.OBLIGATAIRE);
  });

  it("laisse le modèle intact quand le PATCH ne porte pas le champ (régression : un PATCH sur un autre champ ne doit PAS repasser un projet equity en obligataire)", async () => {
    const repo = new InMemoryProjectRepository(
      projetStocke(ModeleEconomique.EQUITY),
    );
    const useCase = new UpdateProjectUseCase(repo as any);

    const projet = await useCase.execute('proj-1', { triCible: 11 });

    expect(projet.triCible).toBe(11);
    expect(projet.modeleEconomique).toBe(ModeleEconomique.EQUITY);
    expect(repo.lastEntity?.modeleEconomique).toBe(ModeleEconomique.EQUITY);
  });

  it('rejette un projet introuvable', async () => {
    const repo = new InMemoryProjectRepository(
      projetStocke(ModeleEconomique.EQUITY),
    );
    const useCase = new UpdateProjectUseCase(repo as any);

    await expect(
      useCase.execute('inconnu', { modeleEconomique: ModeleEconomique.EQUITY }),
    ).rejects.toThrow(/introuvable/i);
  });
});
