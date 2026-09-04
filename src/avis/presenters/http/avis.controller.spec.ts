import { NotFoundException } from '@nestjs/common';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { AvisController } from './avis.controller';

/**
 * Deux routes publiques d'avis servaient la même donnée avec des contrôles
 * différents :
 *  - `GET /projects/:id/avis` filtrait sur le statut du projet ;
 *  - `GET /avis/projet/:projetId` ne filtrait rien — un oracle d'existence sur
 *    les projets non publiés.
 * Aucune des deux n'anonymisait l'auteur : `userId`, prénom ET nom complet
 * sortaient sur une route sans authentification.
 */
describe('AvisController — routes publiques', () => {
  const avisEnBase = [
    {
      id: 'a-1',
      projetId: 'p-1',
      userId: 42,
      note: 5,
      commentaire: 'Très bon projet',
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
      userFirstname: 'Camille',
      userLastname: 'Dupont',
    },
  ];

  const makeController = (statutProjet: ProjectStatus | null) => {
    const avisRepository = {
      findByProjetId: jest.fn().mockResolvedValue(avisEnBase),
      getStats: jest.fn().mockResolvedValue({ noteMoyenne: 5, nbAvis: 1 }),
    };
    const projectRepository = {
      findProjectById: jest
        .fn()
        .mockResolvedValue(
          statutProjet === null ? null : { id: 'p-1', statut: statutProjet },
        ),
    };
    return {
      controller: new AvisController(
        avisRepository as any,
        projectRepository as any,
      ),
      avisRepository,
    };
  };

  const PROJET = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  describe('anonymisation de l’auteur', () => {
    it('ne renvoie ni userId, ni nom complet', async () => {
      const { controller } = makeController(ProjectStatus.EN_COLLECTE);

      const avis = await controller.getByProjet(PROJET);

      expect(avis[0]).toEqual({
        id: 'a-1',
        note: 5,
        commentaire: 'Très bon projet',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        auteur: { prenom: 'Camille', initialeNom: 'D.' },
      });
      expect(avis[0]).not.toHaveProperty('userId');
      expect(JSON.stringify(avis)).not.toContain('Dupont');
    });
  });

  describe('périmètre : projets publiés seulement', () => {
    it.each([
      ProjectStatus.EN_COLLECTE,
      ProjectStatus.PRE_INVESTISSEMENT,
      ProjectStatus.FINANCE,
    ])('sert les avis d’un projet %s', async (statut) => {
      const { controller } = makeController(statut);

      await expect(controller.getByProjet(PROJET)).resolves.toHaveLength(1);
    });

    it.each([
      ProjectStatus.BROUILLON,
      ProjectStatus.ANNONCE,
      ProjectStatus.EN_EXPLOITATION,
      ProjectStatus.ECHEC,
      ProjectStatus.ANNULE,
    ])('refuse un projet %s (404), sans lire les avis', async (statut) => {
      const { controller, avisRepository } = makeController(statut);

      await expect(controller.getByProjet(PROJET)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(avisRepository.findByProjetId).not.toHaveBeenCalled();
    });

    it('projet inexistant et projet non publié rendent la MÊME 404', async () => {
      const inexistant = makeController(null);
      const brouillon = makeController(ProjectStatus.BROUILLON);

      const erreurs = await Promise.all(
        [inexistant, brouillon].map((h) =>
          h.controller.getByProjet(PROJET).catch((e) => e.message),
        ),
      );

      expect(erreurs[0]).toBe(erreurs[1]);
    });

    it('les statistiques suivent la même règle', async () => {
      const { controller, avisRepository } = makeController(
        ProjectStatus.BROUILLON,
      );

      await expect(controller.getStats(PROJET)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(avisRepository.getStats).not.toHaveBeenCalled();
    });
  });
});
