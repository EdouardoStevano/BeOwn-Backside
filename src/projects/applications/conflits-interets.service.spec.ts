import { ConflitsInteretsService } from './conflits-interets.service';
import {
  DetenteurDePartsDeLaSocieteSupportError,
  PorteurDeSonPropreProjetError,
} from 'src/projects/domains/errors/conflits-interets.errors';

/**
 * Le point unique où se décide la séparation porteur / investisseur
 * (décision fondateur D5).
 *
 * Ce qui est éprouvé ici : la règle refuse le porteur DU PROJET VISÉ, laisse
 * passer tous les autres, ne consomme aucune requête quand le projet est déjà
 * en main, et lève des erreurs à code stable — ce sont ces codes que le front
 * et le journal d'audit consomment.
 */
describe('ConflitsInteretsService — décision D5', () => {
  const PORTEUR_ID = 42;
  const AUTRE_PORTEUR_ID = 7;
  const INVESTISSEUR_ID = 99;

  const construire = ({
    projet = { id: 'projet-1', porteurId: PORTEUR_ID },
    investissement = { id: 'inv-1', projetId: 'projet-1' },
    detention = false,
  }: {
    projet?: unknown;
    investissement?: unknown;
    detention?: boolean;
  } = {}) => {
    const projectRepository = {
      findProjectById: jest.fn().mockResolvedValue(projet),
    };
    const investmentRepository = {
      findInvestmentById: jest.fn().mockResolvedValue(investissement),
      existeDetentionSurSocieteSupport: jest.fn().mockResolvedValue(detention),
    };
    const service = new ConflitsInteretsService(
      { findOne: jest.fn() } as any, // userRepo — art. 8 seulement
      { findOne: jest.fn() } as any, // profilRepo — art. 8 seulement
      projectRepository as any,
      investmentRepository as any,
    );
    return { service, projectRepository, investmentRepository };
  };

  describe('assertPasPorteurDuProjet — projet déjà chargé', () => {
    it('refuse le porteur du projet avec le code stable, sans aucune requête', async () => {
      const { service, projectRepository } = construire();

      const erreur = await service
        .assertPasPorteurDuProjet(PORTEUR_ID, { porteurId: PORTEUR_ID })
        .catch((e) => e);

      expect(erreur).toBeInstanceOf(PorteurDeSonPropreProjetError);
      expect(erreur.code).toBe('CONFLIT_INTERETS_PORTEUR_DU_PROJET');
      // Le projet est fourni : le rechercher serait une requête pour rien sur
      // le chemin critique de la souscription.
      expect(projectRepository.findProjectById).not.toHaveBeenCalled();
    });

    it('CONTRE-ÉPREUVE : le porteur d’un autre projet passe', async () => {
      const { service } = construire();
      await expect(
        service.assertPasPorteurDuProjet(AUTRE_PORTEUR_ID, {
          porteurId: PORTEUR_ID,
        }),
      ).resolves.toBeUndefined();
    });

    it('CONTRE-ÉPREUVE : un investisseur ordinaire passe', async () => {
      const { service } = construire();
      await expect(
        service.assertPasPorteurDuProjet(INVESTISSEUR_ID, {
          porteurId: PORTEUR_ID,
        }),
      ).resolves.toBeUndefined();
    });

    it('un projet sans porteur n’exclut personne', async () => {
      const { service } = construire();
      await expect(
        service.assertPasPorteurDuProjet(PORTEUR_ID, { porteurId: null }),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertPasPorteurDuProjet — identifiant seul', () => {
    it('charge le projet et refuse son porteur', async () => {
      const { service, projectRepository } = construire();

      await expect(
        service.assertPasPorteurDuProjet(PORTEUR_ID, 'projet-1'),
      ).rejects.toBeInstanceOf(PorteurDeSonPropreProjetError);
      expect(projectRepository.findProjectById).toHaveBeenCalledWith(
        'projet-1',
      );
    });

    it('projet introuvable : la garde se tait, le 404 de l’appelant fait foi', async () => {
      // Refuser ici renverrait un 403 « vous portez ce projet » sur un projet
      // qui n'existe pas — un message faux, et une piste d'audit trompeuse.
      const { service } = construire({ projet: null });
      await expect(
        service.assertPasPorteurDuProjet(PORTEUR_ID, 'projet-inconnu'),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertPasPorteurDuProjetCede — marché secondaire', () => {
    it('remonte à travers l’investissement du vendeur pour refuser l’acheteur porteur', async () => {
      const { service, investmentRepository, projectRepository } = construire();

      await expect(
        service.assertPasPorteurDuProjetCede(PORTEUR_ID, 'inv-1'),
      ).rejects.toBeInstanceOf(PorteurDeSonPropreProjetError);

      expect(investmentRepository.findInvestmentById).toHaveBeenCalledWith(
        'inv-1',
      );
      expect(projectRepository.findProjectById).toHaveBeenCalledWith(
        'projet-1',
      );
    });

    it('CONTRE-ÉPREUVE : tout autre acheteur passe', async () => {
      const { service } = construire();
      await expect(
        service.assertPasPorteurDuProjetCede(INVESTISSEUR_ID, 'inv-1'),
      ).resolves.toBeUndefined();
    });

    it('investissement introuvable : la garde se tait', async () => {
      const { service, projectRepository } = construire({
        investissement: null,
      });
      await expect(
        service.assertPasPorteurDuProjetCede(PORTEUR_ID, 'inv-absent'),
      ).resolves.toBeUndefined();
      expect(projectRepository.findProjectById).not.toHaveBeenCalled();
    });
  });

  describe('assertPorteurSansPartsDeLaSocieteSupport — sens inverse', () => {
    it('refuse le candidat déjà détenteur, code stable et statut de conflit', async () => {
      const { service, investmentRepository } = construire({ detention: true });

      const erreur = await service
        .assertPorteurSansPartsDeLaSocieteSupport(PORTEUR_ID, 'spv-1')
        .catch((e) => e);

      expect(erreur).toBeInstanceOf(DetenteurDePartsDeLaSocieteSupportError);
      expect(erreur.code).toBe('CONFLIT_INTERETS_DETENTION_SOCIETE_SUPPORT');
      expect(
        investmentRepository.existeDetentionSurSocieteSupport,
      ).toHaveBeenCalledWith(PORTEUR_ID, 'spv-1');
    });

    it('CONTRE-ÉPREUVE : sans détention, le rattachement est accepté', async () => {
      const { service } = construire({ detention: false });
      await expect(
        service.assertPorteurSansPartsDeLaSocieteSupport(PORTEUR_ID, 'spv-1'),
      ).resolves.toBeUndefined();
    });

    it('sans société support déclarée, la règle n’a pas d’objet et n’interroge rien', async () => {
      const { service, investmentRepository } = construire({ detention: true });

      await expect(
        service.assertPorteurSansPartsDeLaSocieteSupport(PORTEUR_ID, null),
      ).resolves.toBeUndefined();
      await expect(
        service.assertPorteurSansPartsDeLaSocieteSupport(PORTEUR_ID, undefined),
      ).resolves.toBeUndefined();

      expect(
        investmentRepository.existeDetentionSurSocieteSupport,
      ).not.toHaveBeenCalled();
    });
  });
});
