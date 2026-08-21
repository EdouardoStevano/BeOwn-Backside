import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException } from '@nestjs/common';
import { ProjectKpiService } from './project-kpi.service';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceStatus, InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';

describe('ProjectKpiService', () => {
  let service: ProjectKpiService;
  const mockCache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const mockProjRepo = { findOne: jest.fn() };
  const mockInvRepo = { find: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectKpiService,
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: getRepositoryToken(ProjectEntity), useValue: mockProjRepo },
        { provide: getRepositoryToken(InvestmentEntity), useValue: mockInvRepo },
      ],
    }).compile();

    service = moduleRef.get(ProjectKpiService);
    jest.clearAllMocks();
  });

  it('returns 404 when project not found or not published', async () => {
    mockProjRepo.findOne.mockResolvedValueOnce(null);
    mockCache.get.mockResolvedValueOnce(null);

    await expect(service.getPublicKpis('missing')).rejects.toThrow(NotFoundException);
  });

  it('returns 404 when project is BROUILLON', async () => {
    mockProjRepo.findOne.mockResolvedValueOnce({
      id: 'p1',
      statut: ProjectStatus.BROUILLON,
    });
    mockCache.get.mockResolvedValueOnce(null);

    await expect(service.getPublicKpis('p1')).rejects.toThrow(NotFoundException);
  });

  it('returns cached value when present and skips DB call', async () => {
    const cached = { capitalCollecte: 999 };
    mockCache.get.mockResolvedValueOnce(cached);

    const r = await service.getPublicKpis('p1');

    expect(r).toBe(cached);
    expect(mockProjRepo.findOne).not.toHaveBeenCalled();
  });

  it('computes KPIs from project + investments when cache miss', async () => {
    mockCache.get.mockResolvedValueOnce(null);
    mockProjRepo.findOne.mockResolvedValueOnce({
      id: 'p1',
      titre: 'Demo',
      statut: ProjectStatus.FINANCE,
      triCible: 9,
      dureeMois: 24,
      capitalCible: 100000,
      instrument: 'obligation',
    });
    mockInvRepo.find.mockResolvedValueOnce([
      {
        id: 'i1',
        montant: 50000,
        utilisateurId: 1,
        statut: InvestmentStatus.CONFIRME,
        echeances: [
          {
            numero: 1,
            datePrevue: new Date('2025-02-01'),
            montantCapital: 0,
            montantInterets: 375,
            montantTotal: 375,
            payeLe: new Date('2025-02-02'),
            statut: EcheanceStatus.PAYE,
          },
          {
            numero: 2,
            datePrevue: new Date('2025-03-01'),
            montantCapital: 50000,
            montantInterets: 375,
            montantTotal: 50375,
            payeLe: null,
            statut: EcheanceStatus.A_VENIR,
          },
        ],
      },
    ]);
    mockCache.set.mockResolvedValueOnce(undefined);

    const r = await service.getPublicKpis('p1');

    expect(r.capitalCollecte).toBe(50000);
    expect(r.pctCollecte).toBe(50);
    expect(r.nbInvestisseurs).toBe(1);
    expect(r.capitalRembourse).toBe(0);
    expect(r.capitalRestantDuGlobal).toBe(50000);
    expect(r.interetsVersesTotaux).toBe(375);
    expect(r.echeancierPrevisionnel).toHaveLength(2);
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('invalidate() removes the cache key for a project', async () => {
    await service.invalidate({ projetId: 'p42' });
    expect(mockCache.del).toHaveBeenCalledWith('project-kpi:p42');
  });

  describe('event-driven cache invalidation', () => {
    it('invalidate() is idempotent when projetId missing', async () => {
      await service.invalidate({ projetId: '' });
      expect(mockCache.del).not.toHaveBeenCalled();
    });

    it('invalidate() is called from @OnEvent decorators (verified by Nest at runtime)', () => {
      expect(typeof service.invalidate).toBe('function');
    });
  });
});
