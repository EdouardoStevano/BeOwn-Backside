import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminSettingsEntity } from 'src/admin/entities/admin-settings.entity';
import { PlatformSettingsService } from './platform-settings.service';

describe('PlatformSettingsService', () => {
  const makeService = async (row: Partial<AdminSettingsEntity> | null) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlatformSettingsService,
        {
          provide: getRepositoryToken(AdminSettingsEntity),
          useValue: { findOne: jest.fn().mockResolvedValue(row) },
        },
      ],
    }).compile();
    return moduleRef.get(PlatformSettingsService);
  };

  it("renvoie l'expediteur configure", async () => {
    const svc = await makeService({
      id: 'default',
      settings: { notifications: { defaultEmailFrom: 'hello@beown.fr' } },
    } as AdminSettingsEntity);
    await expect(svc.getDefaultEmailFrom()).resolves.toBe('hello@beown.fr');
  });

  it('renvoie undefined si le champ est vide', async () => {
    const svc = await makeService({
      id: 'default',
      settings: { notifications: { defaultEmailFrom: '   ' } },
    } as AdminSettingsEntity);
    await expect(svc.getDefaultEmailFrom()).resolves.toBeUndefined();
  });

  it('renvoie undefined si aucune ligne', async () => {
    const svc = await makeService(null);
    await expect(svc.getDefaultEmailFrom()).resolves.toBeUndefined();
  });
});
