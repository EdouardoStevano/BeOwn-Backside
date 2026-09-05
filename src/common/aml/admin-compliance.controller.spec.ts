import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AdminComplianceController } from './admin-compliance.controller';

/**
 * Le contrôleur ne s'appuyait que sur le claim `aml:manage` du jeton et
 * n'interdisait ni l'auto-gel, ni le gel d'un super_admin — c'est-à-dire du
 * seul rôle capable de lever le gel.
 */
describe('AdminComplianceController — gel des avoirs', () => {
  const comptes: Record<number, any> = {
    50: { userId: 50, role: UserRole.COMPLIANCE },
    51: { userId: 51, role: UserRole.INVESTISSEUR },
    52: { userId: 52, role: UserRole.SUPER_ADMIN },
    53: { userId: 53, role: UserRole.INVESTISSEUR },
  };

  const makeController = (inscription: any = null) => {
    const userRepo = {
      findOne: jest.fn(({ where }: any) =>
        Promise.resolve(comptes[where.userId] ?? null),
      ),
      save: jest.fn((u: any) => Promise.resolve(u)),
    };
    const gelDesAvoirs = {
      geler: jest.fn().mockResolvedValue({ gele: true }),
      degeler: jest.fn().mockResolvedValue({ gele: false }),
      listerComptesGeles: jest.fn().mockResolvedValue([]),
    };
    const personneGeleeRepo = {
      find: jest.fn(),
      save: jest.fn((p: any) => Promise.resolve(p)),
      create: jest.fn((p: any) => p),
      findOne: jest.fn().mockResolvedValue(inscription),
    };
    return {
      controller: new AdminComplianceController(
        userRepo as any,
        { create: jest.fn().mockResolvedValue({}) } as any,
        personneGeleeRepo as any,
        gelDesAvoirs as any,
        { rescanTous: jest.fn().mockResolvedValue({}) } as any,
      ),
      gelDesAvoirs,
      personneGeleeRepo,
    };
  };

  const compliance = { userId: 50, role: UserRole.COMPLIANCE } as any;

  it('gèle un compte investisseur (cas nominal)', async () => {
    const { controller, gelDesAvoirs } = makeController();

    await controller.gelerAvoirs('51', { motif: 'Mesure de gel' }, compliance);

    expect(gelDesAvoirs.geler).toHaveBeenCalledWith(51, 'Mesure de gel', compliance);
  });

  it('REFUSE l’auto-gel', async () => {
    const { controller, gelDesAvoirs } = makeController();

    await expect(
      controller.gelerAvoirs('50', { motif: 'peu importe' }, compliance),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gelDesAvoirs.geler).not.toHaveBeenCalled();
  });

  it('REFUSE de geler un super_admin — le seul rôle capable de lever le gel', async () => {
    const { controller, gelDesAvoirs } = makeController();

    await expect(
      controller.gelerAvoirs('52', { motif: 'peu importe' }, compliance),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(gelDesAvoirs.geler).not.toHaveBeenCalled();
  });

  it('refuse une cible inexistante', async () => {
    const { controller } = makeController();

    await expect(
      controller.gelerAvoirs('999', { motif: 'peu importe' }, compliance),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuse un userId illisible', async () => {
    const { controller } = makeController();

    await expect(
      controller.gelerAvoirs('abc', { motif: 'peu importe' }, compliance),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * La liste interne de gel décrit des personnes potentiellement TIERCES à la
   * plateforme, qui n'ont aucun moyen d'en demander l'effacement. Le drapeau
   * `actif` ne disait pas QUAND la mesure avait été levée : ces lignes
   * n'avaient donc aucune durée de conservation calculable, et aucune finalité
   * de purge ne pouvait les viser (art. 5.1.e RGPD).
   */
  describe('radiation de la liste de gel : horodatage de la levée', () => {
    it('pose la date de levée — point de départ des 5 ans de la purge RGPD', async () => {
      const inscription = { id: 'p1', actif: true, desactiveLe: null };
      const { controller } = makeController(inscription);

      const radiee = await controller.desactiverPersonneGelee('p1', compliance);

      expect(radiee.actif).toBe(false);
      expect(radiee.desactiveLe).toBeInstanceOf(Date);
    });

    it('IDEMPOTENTE : rejouer la radiation ne repousse pas l’échéance de cinq ans', async () => {
      const levee = new Date('2021-01-01T00:00:00.000Z');
      const inscription = { id: 'p1', actif: false, desactiveLe: levee };
      const { controller } = makeController(inscription);

      const radiee = await controller.desactiverPersonneGelee('p1', compliance);

      expect(radiee.desactiveLe).toBe(levee);
    });

    it('inscription introuvable : 404, aucune écriture', async () => {
      const { controller, personneGeleeRepo } = makeController(null);

      await expect(
        controller.desactiverPersonneGelee('inconnue', compliance),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(personneGeleeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('rôle relu en base', () => {
    const jetonMenteur = { userId: 53, role: UserRole.COMPLIANCE } as any;

    it('refuse un acteur dont la base dit investisseur, malgré le claim', async () => {
      const { controller, gelDesAvoirs } = makeController();

      await expect(
        controller.gelerAvoirs('51', { motif: 'peu importe' }, jetonMenteur),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(gelDesAvoirs.geler).not.toHaveBeenCalled();
    });

    it('vaut aussi pour le dégel', async () => {
      const { controller, gelDesAvoirs } = makeController();

      await expect(
        controller.degelerAvoirs('51', jetonMenteur),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(gelDesAvoirs.degeler).not.toHaveBeenCalled();
    });

    it('vaut aussi pour le re-scan global', async () => {
      const { controller } = makeController();

      await expect(controller.rescanGlobal(jetonMenteur)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
