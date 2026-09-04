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
    prixUnitaire: '100.00',
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
    const compensation = {
      reserverFonds: jest.fn().mockResolvedValue(undefined),
      libererFonds: jest.fn().mockResolvedValue(0),
    };

    const conflitsInterets = {
      assertPasPorteurDuProjetCede: jest.fn().mockResolvedValue(undefined),
    };

    const usecase = new RepondreInteretUseCase(
      ordreRepo as any,
      initiateBuy as any,
      notifications as any,
      compensation as any,
      conflitsInterets as any,
    );
    return {
      usecase,
      ordreRepo,
      initiateBuy,
      notifications,
      compensation,
      conflitsInterets,
      updates,
    };
  };

  /** Notification poussée à un destinataire donné, ou `undefined`. */
  const notificationPour = (notifications: any, utilisateurId: number) =>
    notifications.push.mock.calls
      .map((appel: any[]) => appel[0])
      .find((opts: any) => opts.utilisateurId === utilisateurId);

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

      // Premier update : passage en ACCEPTE, horodaté — c'est ce repère qui
      // permet au balayeur des ordres orphelins de laisser passer le délai de
      // grâce. Second : retour en INTERET_EXPRIME.
      expect(updates).toHaveLength(2);
      expect(updates[0].set).toMatchObject({ statut: OrdreMarcheStatus.ACCEPTE });
      expect(updates[0].set.accepteLe).toBeDefined();
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

    // ── Réservation des fonds de l'acheteur ────────────────────────────────
    //
    // Le vendeur s'engage ici. Laisser le solde de l'acheteur disponible
    // pendant les 48 h de signature, c'était accepter qu'il le retire et que le
    // règlement échoue APRÈS un engagement déjà pris.

    it("bloque le montant de la cession sur le portefeuille de l'acheteur", async () => {
      const { usecase, compensation } = build();

      await usecase.accepter('ordre-1', 1);

      // 3 fractions × 100 € = 300 € réservés au nom de l'acheteur 42.
      expect(compensation.reserverFonds).toHaveBeenCalledWith(42, 300);
    });

    it('réserve AVANT de générer le contrat : un acheteur insolvable ne mobilise pas le prestataire', async () => {
      const { usecase, compensation, initiateBuy, updates } = build();
      compensation.reserverFonds.mockRejectedValue(
        new BadRequestException('Solde insuffisant'),
      );

      await expect(usecase.accepter('ordre-1', 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(initiateBuy.execute).not.toHaveBeenCalled();
      // Rien à libérer : la réservation a échoué, elle n'a rien posé.
      expect(compensation.libererFonds).not.toHaveBeenCalled();
      // L'annonce revient en attente de réponse : le vendeur garde la main.
      expect(updates[1].set).toEqual({ statut: OrdreMarcheStatus.INTERET_EXPRIME });
    });

    it("si l'initiation échoue APRÈS réservation, les fonds sont rendus", async () => {
      const { usecase, compensation, initiateBuy } = build();
      initiateBuy.execute.mockRejectedValue(new Error('YouSign indisponible'));

      await expect(usecase.accepter('ordre-1', 1)).rejects.toThrow(
        'YouSign indisponible',
      );

      expect(compensation.libererFonds).toHaveBeenCalledWith(42, 300);
    });

    // ── Le contrat va au bon signataire ────────────────────────────────────
    //
    // La partie DÉBITÉE est l'acheteur : c'est lui qui reçoit le parcours de
    // signature. Le vendeur, qui vient de donner son accord, n'a plus rien à
    // signer — le lui présenter revenait à lui faire signer le contrat de
    // l'autre partie.

    it("pousse à l'ACHETEUR le lien de signature, en metadata exploitable", async () => {
      const { usecase, notifications } = build();

      await usecase.accepter('ordre-1', 1);

      const pourAcheteur = notificationPour(notifications, 42);
      expect(pourAcheteur).toBeDefined();
      expect(pourAcheteur.metadata).toEqual({
        ordreId: 'ordre-1',
        signatureId: 'sig-1',
        signingUrl: 'https://yousign.example/sign/abc',
      });
    });

    it("informe le VENDEUR qu'il est en attente de la signature de l'acheteur, sans lien de signature", async () => {
      const { usecase, notifications } = build();

      await usecase.accepter('ordre-1', 1);

      const pourVendeur = notificationPour(notifications, 1);
      expect(pourVendeur).toBeDefined();
      expect(pourVendeur.titre).toContain('signature de l\'acheteur');
      expect(JSON.stringify(pourVendeur)).not.toContain('signingUrl');
      expect(JSON.stringify(pourVendeur)).not.toContain('yousign.example');
    });

    it("une notification en échec ne fait pas échouer une cession déjà initiée", async () => {
      const { usecase, notifications } = build();
      notifications.push.mockRejectedValue(new Error('WS down'));

      await expect(usecase.accepter('ordre-1', 1)).resolves.toMatchObject({
        signatureId: 'sig-1',
      });
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
