import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLogEntity } from '../infrastructure/persistences/entities/audit-log.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';

describe('AuditLogService.findFiltered', () => {
  const qb = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const repo = { createQueryBuilder: jest.fn(() => qb) };
  const userRepo = { find: jest.fn().mockResolvedValue([]) };
  let service: AuditLogService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLogEntity), useValue: repo },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
      ],
    }).compile();
    service = module.get(AuditLogService);
  });

  it('pagine avec limite plafonnée à 100', async () => {
    const res = await service.findFiltered({ page: 2, limit: 500 });
    expect(qb.take).toHaveBeenCalledWith(100);
    expect(qb.skip).toHaveBeenCalledWith(100);
    expect(res).toEqual({ items: [], total: 0, page: 2, limit: 100 });
  });

  it('applique les filtres fournis uniquement', async () => {
    await service.findFiltered({
      acteurId: '7',
      objetType: 'retraits',
      action: 'POST',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-05',
    });
    expect(qb.andWhere).toHaveBeenCalledTimes(5);
  });

  it("enrichit chaque item avec nom/email d'acteur et description", async () => {
    qb.getManyAndCount.mockResolvedValueOnce([
      [
        {
          id: 1,
          acteurId: '7',
          role: 'super_admin',
          action: 'POST /admin/retraits/12/approve',
          objetType: 'retraits',
          objetId: '12',
          ip: '10.0.0.1',
          userAgent: 'jest',
          metadata: { statusCode: 200 },
          createdAt: new Date('2026-07-22T10:00:00Z'),
        },
      ],
      1,
    ]);
    userRepo.find.mockResolvedValueOnce([
      {
        userId: 7,
        firstname: 'Ada',
        lastname: 'Lovelace',
        userEmail: { email: 'ada@beown.io' },
      },
    ]);

    const res = await service.findFiltered({ acteurId: '7' });

    expect(userRepo.find).toHaveBeenCalledTimes(1);
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      id: 1,
      acteurId: '7',
      acteurNom: 'Ada Lovelace',
      acteurEmail: 'ada@beown.io',
      description: "Approbation d'un retrait",
      objetType: 'retraits',
    });
  });

  it('sans utilisateur résolu, retombe sur #acteurId', async () => {
    qb.getManyAndCount.mockResolvedValueOnce([
      [
        {
          id: 2,
          acteurId: '99',
          role: 'support',
          action: 'DELETE /admin/foo/9',
          objetType: 'foo',
          objetId: '9',
          ip: null,
          userAgent: null,
          metadata: null,
          createdAt: new Date('2026-07-22T11:00:00Z'),
        },
      ],
      1,
    ]);
    userRepo.find.mockResolvedValueOnce([]);

    const res = await service.findFiltered({});

    expect(res.items[0]).toMatchObject({
      acteurNom: '#99',
      acteurEmail: null,
      description: 'Suppression de « foo »',
    });
  });
});
