import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UpdateProjectStatusUseCase } from './update-project-status.usecase';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeProject(statut: ProjectStatus) {
  return { id: PROJECT_ID, titre: 'Résidence Horizon', statut } as any;
}

function makeDeps(currentStatus: ProjectStatus) {
  const projectRepository = {
    findProjectById: jest.fn().mockResolvedValue(makeProject(currentStatus)),
    updateProjectStatus: jest
      .fn()
      .mockImplementation((_id: string, statut: ProjectStatus) =>
        Promise.resolve(makeProject(statut)),
      ),
  };
  // BroadcastService mocké : aucun transport réel (email/SMS) n'est jamais
  // touché par ces specs. L'anti-doublon inter-chemins (publish-annonce ET
  // PATCH générique) est porté par le claim atomique sur broadcastAnnonceAt,
  // couvert par broadcast.service.spec.ts — ici on vérifie seulement que
  // chaque transition invoque la bonne campagne.
  const broadcast = {
    announceProjectLaunched: jest.fn().mockResolvedValue({ diffuse: true }),
    announceReservationOpened: jest.fn().mockResolvedValue({ diffuse: true }),
  };
  const usecase = new UpdateProjectStatusUseCase(
    projectRepository as any,
    broadcast as any,
  );
  return { usecase, projectRepository, broadcast };
}

describe('UpdateProjectStatusUseCase — déclencheurs de diffusion', () => {
  it('BROUILLON → ANNONCE déclenche announceReservationOpened (chemin PATCH générique)', async () => {
    const { usecase, broadcast } = makeDeps(ProjectStatus.BROUILLON);

    const result = await usecase.execute(PROJECT_ID, ProjectStatus.ANNONCE, 99);

    expect(result.statut).toBe(ProjectStatus.ANNONCE);
    expect(broadcast.announceReservationOpened).toHaveBeenCalledWith(
      PROJECT_ID,
      99,
    );
    expect(broadcast.announceProjectLaunched).not.toHaveBeenCalled();
  });

  it('ANNONCE → EN_COLLECTE déclenche announceProjectLaunched', async () => {
    const { usecase, broadcast } = makeDeps(ProjectStatus.ANNONCE);

    await usecase.execute(PROJECT_ID, ProjectStatus.EN_COLLECTE, 99);

    expect(broadcast.announceProjectLaunched).toHaveBeenCalledWith(
      PROJECT_ID,
      99,
    );
    expect(broadcast.announceReservationOpened).not.toHaveBeenCalled();
  });

  it('les autres transitions ne diffusent rien (ex. EN_COLLECTE → FINANCE)', async () => {
    const { usecase, broadcast } = makeDeps(ProjectStatus.EN_COLLECTE);

    await usecase.execute(PROJECT_ID, ProjectStatus.FINANCE, 99);

    expect(broadcast.announceProjectLaunched).not.toHaveBeenCalled();
    expect(broadcast.announceReservationOpened).not.toHaveBeenCalled();
  });

  it('transition invalide → BadRequest, aucune diffusion', async () => {
    const { usecase, broadcast, projectRepository } = makeDeps(
      ProjectStatus.CLOTURE,
    );

    await expect(
      usecase.execute(PROJECT_ID, ProjectStatus.EN_COLLECTE, 99),
    ).rejects.toThrow(BadRequestException);
    expect(projectRepository.updateProjectStatus).not.toHaveBeenCalled();
    expect(broadcast.announceProjectLaunched).not.toHaveBeenCalled();
  });

  it('projet introuvable → NotFound, aucune diffusion', async () => {
    const { usecase, broadcast, projectRepository } = makeDeps(
      ProjectStatus.BROUILLON,
    );
    projectRepository.findProjectById.mockResolvedValue(null);

    await expect(
      usecase.execute(PROJECT_ID, ProjectStatus.ANNONCE, 99),
    ).rejects.toThrow(NotFoundException);
    expect(broadcast.announceReservationOpened).not.toHaveBeenCalled();
  });

  it('un rejet de la diffusion ne fait pas échouer la transition (fire-and-forget)', async () => {
    const { usecase, broadcast } = makeDeps(ProjectStatus.BROUILLON);
    broadcast.announceReservationOpened.mockRejectedValue(
      new Error('broadcast down'),
    );

    const result = await usecase.execute(
      PROJECT_ID,
      ProjectStatus.ANNONCE,
      99,
    );

    expect(result.statut).toBe(ProjectStatus.ANNONCE);
    // Laisse la microtâche du .catch() se résoudre — aucune rejection non gérée.
    await new Promise(process.nextTick);
  });
});
