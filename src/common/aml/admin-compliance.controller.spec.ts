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

  const makeController = () => {
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
    return {
      controller: new AdminComplianceController(
        userRepo as any,
        { create: jest.fn().mockResolvedValue({}) } as any,
        { find: jest.fn(), save: jest.fn(), create: jest.fn(), findOne: jest.fn() } as any,
        gelDesAvoirs as any,
        { rescanTous: jest.fn().mockResolvedValue({}) } as any,
      ),
      gelDesAvoirs,
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
