import { ForbiddenException } from '@nestjs/common';
import {
  AdminRgpdController,
  RGPD_PURGE_ROLES,
} from 'src/rgpd/presenters/http/admin-rgpd.controller';

/**
 * La purge détruit des données : on verrouille QUI peut la déclencher.
 * Les rôles habilités sont DÉRIVÉS de la matrice de permissions (conjonction
 * data:export ∧ audit:read) — ce spec fige le résultat attendu pour qu'un
 * remaniement de la matrice qui élargirait l'accès casse un test.
 */
describe('AdminRgpdController', () => {
  let controller: AdminRgpdController;
  let userRepo: any;
  let purge: any;

  const rapport = { executeLe: 'x', compteurs: [], totalTraites: 0 };

  beforeEach(() => {
    userRepo = { findOne: jest.fn() };
    purge = { purger: jest.fn().mockResolvedValue(rapport) };
    controller = new AdminRgpdController(userRepo, purge);
  });

  it('les rôles habilités dérivés de la matrice sont EXACTEMENT dpo et super_admin', () => {
    expect([...RGPD_PURGE_ROLES].sort()).toEqual(['dpo', 'super_admin']);
  });

  it.each(['dpo', 'super_admin'])(
    'un %s (rôle relu en base) déclenche la purge et reçoit le rapport',
    async (role) => {
      userRepo.findOne.mockResolvedValue({ userId: 1, role });
      await expect(
        controller.run({ userId: 1, role } as any),
      ).resolves.toEqual(rapport);
      expect(purge.purger).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['marketing', 'rcci', 'compliance', 'investisseur'])(
    'un rôle %s est refusé (403) même si le guard HTTP a laissé passer',
    async (role) => {
      userRepo.findOne.mockResolvedValue({ userId: 2, role });
      await expect(
        controller.run({ userId: 2, role } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(purge.purger).not.toHaveBeenCalled();
    },
  );

  it('jeton valide mais compte disparu en base → 403, pas de purge', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(
      controller.run({ userId: 3, role: 'dpo' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(purge.purger).not.toHaveBeenCalled();
  });
});
