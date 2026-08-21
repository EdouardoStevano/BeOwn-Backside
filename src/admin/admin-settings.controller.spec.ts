import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminSettingsController } from './admin-settings.controller';
import { UserRole } from 'src/iam/domain/enums/user.enum';

describe('AdminSettingsController.update — validation commissions', () => {
  const admin = { userId: 1 } as any;

  const makeController = (existingSettings: any = {}) => {
    const userRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ userId: 1, role: UserRole.SUPER_ADMIN }),
    };
    const row = { id: 'default', settings: existingSettings };
    const settingsRepo = {
      findOne: jest.fn().mockResolvedValue(row),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AdminSettingsController(
      userRepo as any,
      settingsRepo as any,
    );
    return { controller, userRepo, settingsRepo };
  };

  it('rejette une commission non numérique (BadRequest nommant la clé)', async () => {
    const { controller, settingsRepo } = makeController();

    await expect(
      controller.update(
        { commissions: { rentManagementFeePct: '7' as any } },
        admin,
      ),
    ).rejects.toThrow(/commissions\.rentManagementFeePct/);
    expect(settingsRepo.update).not.toHaveBeenCalled();
  });

  it('rejette NaN et Infinity', async () => {
    const { controller } = makeController();

    await expect(
      controller.update(
        { commissions: { annualPlatformFeePct: Number.NaN } },
        admin,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.update(
        { commissions: { shareSaleGainFeePct: Number.POSITIVE_INFINITY } },
        admin,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejette une valeur hors bornes [0, 100]', async () => {
    const { controller } = makeController();

    await expect(
      controller.update(
        { commissions: { propertySaleGainFeePct: -1 } },
        admin,
      ),
    ).rejects.toThrow(/commissions\.propertySaleGainFeePct/);
    await expect(
      controller.update(
        { commissions: { resaleTransactionFeePct: 100.01 } },
        admin,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte les bornes 0 et 100 et fusionne avec les settings existants', async () => {
    const { controller, settingsRepo } = makeController({
      commissions: { annualPlatformFeePct: 2 },
    });

    const merged = await controller.update(
      { commissions: { rentManagementFeePct: 0, shareSaleGainFeePct: 100 } },
      admin,
    );

    expect(merged.commissions).toEqual({
      annualPlatformFeePct: 2,
      rentManagementFeePct: 0,
      shareSaleGainFeePct: 100,
    });
    expect(settingsRepo.update).toHaveBeenCalledWith(
      { id: 'default' },
      { settings: merged },
    );
  });

  it('purge les clés legacy stockées lors du merge (hygiène R2)', async () => {
    const { controller } = makeController({
      commissions: {
        // Clés legacy persistées avant le déploiement des frais configurables
        investmentFeePct: 1.5,
        secondaryMarketFeePct: 2,
        earlyExitFeePct: 1,
        // Clé connue déjà stockée
        annualPlatformFeePct: 2,
      },
    });

    const merged = await controller.update(
      { commissions: { rentManagementFeePct: 5 } },
      admin,
    );

    // Uniquement les clés connues : legacy éliminées, connues fusionnées
    expect(merged.commissions).toEqual({
      annualPlatformFeePct: 2,
      rentManagementFeePct: 5,
    });
  });

  it('ne valide pas les commissions quand le patch ne les contient pas', async () => {
    const { controller, settingsRepo } = makeController();

    const merged = await controller.update(
      { platform: { name: 'BeOwn Test' } },
      admin,
    );

    expect(merged.platform?.name).toBe('BeOwn Test');
    expect(settingsRepo.update).toHaveBeenCalled();
  });

  it("refuse l'accès si l'utilisateur n'a pas settings:manage", async () => {
    const userRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ userId: 2, role: UserRole.MARKETING }),
    };
    const settingsRepo = { findOne: jest.fn(), update: jest.fn() };
    const controller = new AdminSettingsController(
      userRepo as any,
      settingsRepo as any,
    );

    await expect(
      controller.update({ commissions: {} }, { userId: 2 } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(settingsRepo.update).not.toHaveBeenCalled();
  });

  it('ignore silencieusement les clés platform legacy (defaultCurrency, timezone) lors du merge', async () => {
    const { controller } = makeController({
      platform: {
        name: 'BeOwn',
        defaultCurrency: 'EUR',
        timezone: 'Africa/Abidjan',
      },
    });

    const merged = await controller.update(
      { platform: { contactEmail: 'contact@beown.fr' } },
      admin,
    );

    expect(merged.platform).toEqual({
      name: 'BeOwn',
      contactEmail: 'contact@beown.fr',
    });
  });
});

describe('AdminSettingsController.get — tolérance blobs legacy', () => {
  const admin = { userId: 1 } as any;

  it('ne renvoie plus defaultCurrency/timezone pour une ligne persistée avant leur retrait', async () => {
    const userRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ userId: 1, role: UserRole.SUPER_ADMIN }),
    };
    const row = {
      id: 'default',
      settings: {
        platform: {
          name: 'BeOwn',
          contactEmail: 'support@beown.fr',
          defaultCurrency: 'EUR',
          timezone: 'Africa/Abidjan',
        },
      },
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const settingsRepo = {
      findOne: jest.fn().mockResolvedValue(row),
    };
    const controller = new AdminSettingsController(
      userRepo as any,
      settingsRepo as any,
    );

    const result = await controller.get(admin);

    expect(result.platform).toEqual({
      name: 'BeOwn',
      contactEmail: 'support@beown.fr',
    });
    expect(result.platform).not.toHaveProperty('defaultCurrency');
    expect(result.platform).not.toHaveProperty('timezone');
  });
});
