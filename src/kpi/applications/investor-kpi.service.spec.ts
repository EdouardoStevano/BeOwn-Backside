import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvestorKpiService } from './investor-kpi.service';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { EcheanceStatus } from 'src/servicing/domain/enums/echeance.enum';

describe('InvestorKpiService', () => {
  let service: InvestorKpiService;

  const mockInvRepo = { find: jest.fn() };
  const mockEchRepo = {};
  const mockUserRepo = { findOneByOrFail: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvestorKpiService,
        { provide: getRepositoryToken(InvestmentEntity), useValue: mockInvRepo },
        { provide: getRepositoryToken(EcheanceEntity), useValue: mockEchRepo },
        { provide: getRepositoryToken(UserEntity), useValue: mockUserRepo },
      ],
    }).compile();

    service = moduleRef.get(InvestorKpiService);
    jest.clearAllMocks();
  });

  describe('computePortfolio', () => {
    it('returns empty portfolio when user has no investments', async () => {
      mockInvRepo.find.mockResolvedValueOnce([]);
      mockUserRepo.findOneByOrFail.mockResolvedValueOnce({ regimeFiscal: 'PFU' });

      const r = await service.computePortfolio(42);

      expect(r.capitalInvestiTotal).toBe(0);
      expect(r.capitalRestantDu).toBe(0);
      expect(r.interetsBrutsCumules).toBe(0);
      expect(r.parProjet).toEqual([]);
      expect(r.regimeFiscal).toBe('PFU');
      expect(r.triRealise).toBeNull();
    });

    it('aggregates a single investment with two paid échéances under PFU', async () => {
      const investment = {
        id: 'inv-1',
        projetId: 'proj-1',
        projet: {
          id: 'proj-1',
          titre: 'Projet Demo',
          statut: 'finance',
          triCible: 9,
        },
        montant: 1000,
        createdAt: new Date('2025-01-01'),
        echeances: [
          {
            id: 'e-1',
            numero: 1,
            datePrevue: new Date('2025-02-01'),
            montantCapital: 0,
            montantInterets: 100,
            montantTotal: 100,
            payeLe: new Date('2025-02-02'),
            statut: EcheanceStatus.PAYE,
          },
          {
            id: 'e-2',
            numero: 2,
            datePrevue: new Date('2025-03-01'),
            montantCapital: 1000,
            montantInterets: 100,
            montantTotal: 1100,
            payeLe: new Date('2025-03-02'),
            statut: EcheanceStatus.PAYE,
          },
        ],
      };

      mockInvRepo.find.mockResolvedValueOnce([investment]);
      mockUserRepo.findOneByOrFail.mockResolvedValueOnce({ regimeFiscal: 'PFU' });

      const r = await service.computePortfolio(42);

      expect(r.capitalInvestiTotal).toBe(1000);
      expect(r.capitalRestantDu).toBe(0);
      expect(r.interetsBrutsCumules).toBe(200);
      // 200 brut → IR 25.60 + CSG 34.40 = 60 prélevé, 140 net
      expect(r.interetsNetsCumules).toBeCloseTo(140, 1);
      expect(r.prelevementsFiscauxCumules).toBeCloseTo(60, 1);
      expect(r.parProjet).toHaveLength(1);
      expect(r.parProjet[0].projetId).toBe('proj-1');
      expect(r.parProjet[0].nbEcheancesEnRetard).toBe(0);
      expect(r.parProjet[0].aEnDefaut).toBe(false);
    });

    it('detects échéances en retard and en défaut', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 95); // > 90 jours = défaut

      const investment = {
        id: 'inv-2',
        projetId: 'proj-2',
        projet: { id: 'proj-2', titre: 'Late', statut: 'finance', triCible: 8 },
        montant: 500,
        createdAt: new Date('2024-01-01'),
        echeances: [
          {
            id: 'e-3',
            numero: 1,
            datePrevue: oldDate,
            montantCapital: 500,
            montantInterets: 40,
            montantTotal: 540,
            payeLe: null,
            statut: EcheanceStatus.RETARD_LEGER,
          },
        ],
      };

      mockInvRepo.find.mockResolvedValueOnce([investment]);
      mockUserRepo.findOneByOrFail.mockResolvedValueOnce({ regimeFiscal: 'PFU' });

      const r = await service.computePortfolio(42);

      expect(r.parProjet[0].nbEcheancesEnRetard).toBe(1);
      expect(r.parProjet[0].aEnDefaut).toBe(true);
      expect(r.capitalRestantDu).toBe(500);
    });

    it('truncates parProjet when more than 200 investments and flags truncated', async () => {
      const many = Array.from({ length: 250 }, (_, i) => ({
        id: `inv-${i}`,
        projetId: `proj-${i}`,
        projet: { id: `proj-${i}`, titre: `P${i}`, statut: 'finance', triCible: 8 },
        montant: 100,
        createdAt: new Date('2025-01-01'),
        echeances: [],
      }));

      mockInvRepo.find.mockResolvedValueOnce(many);
      mockUserRepo.findOneByOrFail.mockResolvedValueOnce({ regimeFiscal: 'PFU' });

      const r = await service.computePortfolio(42);

      expect(r.parProjet.length).toBe(50);
      expect(r.truncated).toBe(true);
      expect(r.capitalInvestiTotal).toBe(25000);
    });
  });
});
