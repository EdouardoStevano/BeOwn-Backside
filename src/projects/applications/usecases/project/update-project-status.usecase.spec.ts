import type { EventBus } from '@nestjs/cqrs';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { CollecteOuverteDomainEvent } from 'src/projects/domains/events/collecte-ouverte.domain-event';
import { ProjetAnnonceDomainEvent } from 'src/projects/domains/events/projet-annonce.domain-event';
import {
  ProjetIntrouvableError,
  TransitionStatutProjetInvalideError,
} from 'src/projects/domains/errors';
import { ProjectFactory } from 'src/projects/domains/factories/project.factory';
import {
  ProjectInstrument,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';
import { Project } from 'src/projects/domains/project';
import { UpdateProjectStatusUseCase } from './update-project-status.usecase';

const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function projetEn(statut: ProjectStatus): Project {
  // La fabrique refuse de faire naître un projet ailleurs qu'en brouillon ou
  // en annonce : on l'y amène par les transitions, ce qui vérifie au passage
  // que le chemin existe.
  const projet = ProjectFactory.creer({
    titre: 'Résidence Horizon',
    type: ProjectType.RESIDENTIEL,
    capitalCible: 500_000,
    capitalMinimum: 300_000,
    dureeMois: 24,
    instrument: ProjectInstrument.OBLIGATION,
  });
  const chemin: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
    [ProjectStatus.BROUILLON]: [],
    [ProjectStatus.ANNONCE]: [ProjectStatus.ANNONCE],
    [ProjectStatus.EN_COLLECTE]: [
      ProjectStatus.ANNONCE,
      ProjectStatus.EN_COLLECTE,
    ],
    [ProjectStatus.FINANCE]: [
      ProjectStatus.ANNONCE,
      ProjectStatus.EN_COLLECTE,
      ProjectStatus.FINANCE,
    ],
    [ProjectStatus.CLOTURE]: [
      ProjectStatus.ANNONCE,
      ProjectStatus.EN_COLLECTE,
      ProjectStatus.FINANCE,
      ProjectStatus.EN_EXPLOITATION,
      ProjectStatus.CLOTURE,
    ],
  };
  for (const etape of chemin[statut] ?? []) projet.changerStatut(etape);
  return projet;
}

function makeDeps(statutCourant: ProjectStatus) {
  const projet = projetEn(statutCourant);
  const projectRepository = {
    findProjectById: jest.fn().mockResolvedValue(projet),
    saveProject: jest
      .fn()
      .mockImplementation((p: Project) => Promise.resolve(p)),
  };
  const publish = jest.fn();
  const usecase = new UpdateProjectStatusUseCase(
    projectRepository as never,
    { publish } as unknown as EventBus,
  );
  return { usecase, projectRepository, publish, projet };
}

describe('UpdateProjectStatusUseCase', () => {
  it('BROUILLON → ANNONCE publie ProjetAnnonce (chemin PATCH générique)', async () => {
    const { usecase, publish } = makeDeps(ProjectStatus.BROUILLON);

    const projet = await usecase.execute(PROJECT_ID, ProjectStatus.ANNONCE, 99);

    expect(projet.statut).toBe(ProjectStatus.ANNONCE);
    expect(publish).toHaveBeenCalledTimes(1);
    const event = publish.mock.calls[0][0] as ProjetAnnonceDomainEvent;
    expect(event).toBeInstanceOf(ProjetAnnonceDomainEvent);
    expect(event.declenchePar).toBe(99);
  });

  it('ANNONCE → EN_COLLECTE publie CollecteOuverte', async () => {
    const { usecase, publish } = makeDeps(ProjectStatus.ANNONCE);

    await usecase.execute(PROJECT_ID, ProjectStatus.EN_COLLECTE, 99);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toBeInstanceOf(CollecteOuverteDomainEvent);
  });

  it('les autres transitions ne publient rien (ex. EN_COLLECTE → FINANCE)', async () => {
    const { usecase, publish } = makeDeps(ProjectStatus.EN_COLLECTE);

    await usecase.execute(PROJECT_ID, ProjectStatus.FINANCE, 99);

    expect(publish).not.toHaveBeenCalled();
  });

  it('estampille les jalons de publication — la règle a quitté le repository', async () => {
    const { usecase } = makeDeps(ProjectStatus.ANNONCE);

    const projet = await usecase.execute(
      PROJECT_ID,
      ProjectStatus.EN_COLLECTE,
      99,
    );

    expect(projet.datePublication).toBeInstanceOf(Date);
    expect(projet.dateOuvertureCollecte).toBeInstanceOf(Date);
  });

  it('transition invalide → rien n’est enregistré ni publié', async () => {
    const { usecase, publish, projectRepository } = makeDeps(
      ProjectStatus.CLOTURE,
    );

    await expect(
      usecase.execute(PROJECT_ID, ProjectStatus.EN_COLLECTE, 99),
    ).rejects.toThrow(TransitionStatutProjetInvalideError);
    expect(projectRepository.saveProject).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('projet introuvable → ProjetIntrouvable, rien n’est publié', async () => {
    const { usecase, publish, projectRepository } = makeDeps(
      ProjectStatus.BROUILLON,
    );
    projectRepository.findProjectById.mockResolvedValue(null);

    await expect(
      usecase.execute(PROJECT_ID, ProjectStatus.ANNONCE, 99),
    ).rejects.toThrow(ProjetIntrouvableError);
    expect(publish).not.toHaveBeenCalled();
  });
});
