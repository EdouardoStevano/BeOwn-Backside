import { IfuCronService } from './ifu-cron.service';

/**
 * Test de caractérisation du correctif de collecte des IFU.
 *
 * Bug corrigé : `run()` collectait les investisseurs à partir des parts NON
 * payées (`findUnpaid`) avant de les filtrer sur `payeLe` — l'ensemble était
 * vide par construction, la génération annuelle ne produisait donc JAMAIS
 * aucun IFU. La collecte passe désormais par une requête dédiée qui répond
 * directement à la question « qui a été payé sur l'exercice ? ».
 *
 * Aucun accès base ni réseau : le service applicatif ne dépend que de ports.
 */
describe('IfuCronService', () => {
  let service: IfuCronService;
  let partRepo: any;
  let generateUseCase: any;

  beforeEach(() => {
    partRepo = {
      // Source de vérité unique de la collecte : les investisseurs 7 et 9 ont
      // chacun perçu au moins une part payée en 2025.
      findUtilisateurIdsAvecPartPayeeSurAnnee: jest
        .fn()
        .mockResolvedValue([7, 9]),
      // Présentes uniquement pour prouver qu'elles ne sont PLUS sollicitées.
      findUnpaid: jest.fn().mockResolvedValue([]),
      findByInvestissementIds: jest.fn().mockResolvedValue([]),
    };
    generateUseCase = { execute: jest.fn().mockResolvedValue(undefined) };

    service = new IfuCronService(generateUseCase, partRepo);
  });

  describe('run — collecte des investisseurs à déclarer', () => {
    it('génère un IFU pour chaque investisseur ayant perçu une part payée sur l\'année', async () => {
      const resultat = await service.run(2025);

      expect(
        partRepo.findUtilisateurIdsAvecPartPayeeSurAnnee,
      ).toHaveBeenCalledWith(2025);
      expect(generateUseCase.execute).toHaveBeenCalledTimes(2);
      expect(generateUseCase.execute).toHaveBeenCalledWith(7, 2025);
      expect(generateUseCase.execute).toHaveBeenCalledWith(9, 2025);
      expect(resultat).toEqual({
        nbInvestisseurs: 2,
        nbSucces: 2,
        nbErreurs: 0,
        erreurs: [],
      });
    });

    it('ne collecte JAMAIS via les parts non payées (non-régression du bug qui produisait zéro IFU)', async () => {
      await service.run(2025);

      // L'ancienne implémentation partait de findUnpaid() puis éliminait
      // toutes les parts avec `if (!part.payeLe) continue` : c'est exactement
      // ce chemin qui ne doit plus exister.
      expect(partRepo.findUnpaid).not.toHaveBeenCalled();
      expect(partRepo.findByInvestissementIds).not.toHaveBeenCalled();
    });

    it('ne génère rien et ne remonte aucune erreur quand personne n\'a été payé sur l\'année', async () => {
      partRepo.findUtilisateurIdsAvecPartPayeeSurAnnee.mockResolvedValue([]);

      const resultat = await service.run(2025);

      expect(generateUseCase.execute).not.toHaveBeenCalled();
      expect(resultat).toEqual({
        nbInvestisseurs: 0,
        nbSucces: 0,
        nbErreurs: 0,
        erreurs: [],
      });
    });
  });

  describe('run — robustesse du lot annuel', () => {
    it('poursuit le lot quand un IFU échoue et remonte { userId, raison }', async () => {
      generateUseCase.execute.mockImplementation((userId: number) =>
        userId === 7
          ? Promise.reject(new Error('document fiscal indisponible'))
          : Promise.resolve(undefined),
      );

      const resultat = await service.run(2025);

      // L'investisseur 9 est traité malgré l'échec du 7.
      expect(generateUseCase.execute).toHaveBeenCalledTimes(2);
      expect(generateUseCase.execute).toHaveBeenCalledWith(9, 2025);
      expect(resultat).toEqual({
        nbInvestisseurs: 2,
        nbSucces: 1,
        nbErreurs: 1,
        erreurs: [{ userId: 7, raison: 'document fiscal indisponible' }],
      });
    });
  });
});
