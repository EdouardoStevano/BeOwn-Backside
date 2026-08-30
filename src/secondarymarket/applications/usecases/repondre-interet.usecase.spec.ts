import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { RepondreInteretUseCase } from './repondre-interet.usecase';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';

/**
 * La réponse du vendeur est LE point de formation du contrat. Trois choses à
 * garantir : seul le vendeur répond, l'acceptation délègue à l'initiation de
 * la cession (et se remet en attente si celle-ci échoue), le refus remet
 * l'annonce en circulation.
 */
describe('RepondreInteretUseCase', () => {
  const ordreEnAttente = () => ({
    id: 'ordre-1',
    vendeurId: 1,
    acheteurId: 42,
    statut: OrdreMarcheStatus.INTERET_EXPRIME,
    interetNbFractions: 3,
  });

  const build = (ordre: any = ordreEnAttente()) => {
    const updates: Array<{ set: any; where: any[] }> = [];
    const ordreRepo = {
      findOne: jest.fn().mockResolvedValue(ordre),
      createQueryBuilder: jest.fn(() => {
        const call: { set: any; where: any[] } = { set: null, where: [] };
        updates.push(call);
        const qb: any = {
          update: jest.fn(() => qb),
          set: jest.fn((v: any) => {
            call.set = v;
            return qb;
          }),
          where: jest.fn((...args: any[]) => {
            call.where = args;
            return qb;
          }),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        return qb;
      }),
    };
    const initiateBuy = {
      execute: jest.fn().mockResolvedValue({
        signingUrl: 'https://yousign.example/sign/abc',
        signatureId: 'sig-1',
      }),
    };
    const notifications = { push: jest.fn() };

    const usecase = new RepondreInteretUseCase(
      ordreRepo as any,
      initiateBuy as any,
      notifications as any,
    );
    return { usecase, ordreRepo, initiateBuy, notifications, updates };
  };

  describe('accepter', () => {
    it("délègue à InitiateBuyUseCase et renvoie ordreId + parcours de signature", async () => {
      const { usecase, initiateBuy } = build();

      const resultat = await usecase.accepter('ordre-1', 1);

      expect(initiateBuy.execute).toHaveBeenCalledWith('ordre-1', 42, 3);
      expect(resultat).toEqual({
        ordreId: 'ordre-1',
        signingUrl: 'https://yousign.example/sign/abc',
        signatureId: 'sig-1',
      });
    });

    it("seul le vendeur de l'annonce peut accepter", async () => {
      const { usecase, initiateBuy } = build();

      await expect(usecase.accepter('ordre-1', 99)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(initiateBuy.execute).not.toHaveBeenCalled();
    });

    it("si l'initiation échoue, l'annonce est ramenée en interet_exprime — jamais coincée en accepte", async () => {
      const { usecase, initiateBuy, updates } = build();
      initiateBuy.execute.mockRejectedValue(new Error('YouSign indisponible'));

      await expect(usecase.accepter('ordre-1', 1)).rejects.toThrow(
        'YouSign indisponible',
      );

      // Premier update : passage en ACCEPTE. Second : retour en INTERET_EXPRIME.
      expect(updates).toHaveLength(2);
      expect(updates[0].set).toEqual({ statut: OrdreMarcheStatus.ACCEPTE });
      expect(updates[1].set).toEqual({ statut: OrdreMarcheStatus.INTERET_EXPRIME });
      expect(updates[1].where[1]).toMatchObject({
        accepte: OrdreMarcheStatus.ACCEPTE,
      });
    });

    it("refuse une annonce sans marque d'intérêt exploitable", async () => {
      const { usecase } = build({
        ...ordreEnAttente(),
        acheteurId: null,
        interetNbFractions: null,
      });
      await expect(usecase.accepter('ordre-1', 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('refuser', () => {
    it("remet l'annonce en circulation et purge la marque d'intérêt", async () => {
      const { usecase, updates, notifications } = build();

      const resultat = await usecase.refuser('ordre-1', 1);

      expect(resultat).toEqual({
        ordreId: 'ordre-1',
        statut: OrdreMarcheStatus.EN_CARNET,
      });
      expect(updates[0].set).toEqual({
        statut: OrdreMarcheStatus.EN_CARNET,
        acheteurId: null,
        interetNbFractions: null,
        interetExprimeLe: null,
      });
      // L'acheteur éconduit est prévenu.
      expect(notifications.push).toHaveBeenCalledWith(
        expect.objectContaining({ utilisateurId: 42 }),
      );
    });

    it('seul le vendeur peut refuser', async () => {
      const { usecase } = build();
      await expect(usecase.refuser('ordre-1', 99)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
