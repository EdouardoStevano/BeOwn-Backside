import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLogEntity } from '../infrastructure/persistences/entities/audit-log.entity';

describe('AuditLogService.findFiltered', () => {
  const qb = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const repo = { createQueryBuilder: jest.fn(() => qb) };
  let service: AuditLogService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLogEntity), useValue: repo },
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
});
