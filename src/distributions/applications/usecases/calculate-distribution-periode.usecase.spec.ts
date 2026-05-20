import { CalculateDistributionPeriodeUseCase } from './calculate-distribution-periode.usecase';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

describe('CalculateDistributionPeriodeUseCase', () => {
  let useCase: CalculateDistributionPeriodeUseCase;
  let periodeRepo: any;
  let partRepo: any;
  let loyerRepo: any;
  let chargeRepo: any;
  let projectRepo: any;
  let investmentRepo: any;

  beforeEach(() => {
    periodeRepo = {
      findByProjetEtPeriode: jest.fn().mockResolvedValue(null),
      save: jest
        .fn()
        .mockImplementation((p) => Promise.resolve({ ...p, id: 'pd-1' })),
    };
    partRepo = {
      saveAll: jest.fn().mockImplementation((parts) => Promise.resolve(parts)),
    };
    loyerRepo = { findValidesParProjetEtPeriode: jest.fn().mockResolvedValue([]) };
    chargeRepo = { findValidesParProjetEtPeriode: jest.fn().mockResolvedValue([]) };
    projectRepo = {
      findProjectById: jest.fn().mockResolvedValue({
        id: 'proj-1',
        modeleEconomique: ModeleEconomique.EQUITY,
        statut: ProjectStatus.FINANCE,
        capitalCible: 1_000_000,
      }),
    };
    investmentRepo = { findByProjetId: jest.fn().mockResolvedValue([]) };

    useCase = new CalculateDistributionPeriodeUseCase(
      periodeRepo,
      partRepo,
      loyerRepo,
      chargeRepo,
      projectRepo,
      investmentRepo,
    );
  });

  it('calcule revenuNet = (totalLoyers − charges) − management fee 1%/12 et statut CALCULEE', async () => {
    loyerRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 600_000 },
      { montant: 400_000 },
    ]);
    chargeRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 150_000 },
    ]);
    const r = await useCase.execute('proj-1', '2026-06');
    expect(r.periode.totalLoyers).toBe(1_000_000);
    // totalCharges = 150_000 + management fee (1/12 du 1%/an sur revenu avant gestion 850_000)
    //              = 150_000 + 708.33
    expect(r.periode.totalCharges).toBeCloseTo(150_708.33, 2);
    expect(r.periode.revenuNet).toBeCloseTo(849_291.67, 2);
    expect(r.periode.statut).toBe(StatutPeriodeDistribution.CALCULEE);
  });

  it('génère une DistributionPart par investisseur CONFIRME, au prorata', async () => {
    loyerRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 1_000_000 },
    ]);
    investmentRepo.findByProjetId.mockResolvedValue([
      { id: 'inv-1', montant: 500_000, statut: InvestmentStatus.CONFIRME },
      { id: 'inv-2', montant: 300_000, statut: InvestmentStatus.CONFIRME },
      { id: 'inv-cancel', montant: 200_000, statut: InvestmentStatus.ANNULE }, // ignoré
    ]);
    const r = await useCase.execute('proj-1', '2026-06');
    expect(r.parts).toHaveLength(2);
    expect(r.parts[0].pourcentageDetention).toBe(0.5);
    // Avec management fee 833.33, revenuNet = 999_166.67 → inv-1 (50%) ≈ 499_583.33
    expect(r.parts[0].montantBrut).toBeCloseTo(499_583.33, 1);
    expect(r.parts[1].pourcentageDetention).toBe(0.3);
    expect(r.parts[1].montantBrut).toBeCloseTo(299_750, 1);
  });

  it('applique IR 12.8% + CSG 17.2% sur brut positif (après management fee)', async () => {
    loyerRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 100_000 },
    ]);
    investmentRepo.findByProjetId.mockResolvedValue([
      { id: 'inv-1', montant: 1_000_000, statut: InvestmentStatus.CONFIRME },
    ]);
    const r = await useCase.execute('proj-1', '2026-06');
    // managementFee = 100_000 × 0.01/12 = 83.33 → revenuNet = 99_916.67
    expect(r.parts[0].montantBrut).toBeCloseTo(99_916.67, 2);
    expect(r.parts[0].prelevementIR).toBeCloseTo(12_789.33, 2);
    expect(r.parts[0].prelevementCSG).toBeCloseTo(17_185.67, 2);
    expect(r.parts[0].montantNet).toBeCloseTo(69_941.67, 2);
  });

  it('ne prélève pas IR/CSG sur revenu négatif (mois déficitaire)', async () => {
    chargeRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 200_000 },
    ]);
    investmentRepo.findByProjetId.mockResolvedValue([
      { id: 'inv-1', montant: 1_000_000, statut: InvestmentStatus.CONFIRME },
    ]);
    const r = await useCase.execute('proj-1', '2026-06');
    expect(r.parts[0].montantBrut).toBe(-200_000);
    expect(r.parts[0].prelevementIR).toBe(0);
    expect(r.parts[0].prelevementCSG).toBe(0);
    expect(r.parts[0].montantNet).toBe(-200_000);
  });

  it('rejette si période déjà calculée pour ce projet', async () => {
    periodeRepo.findByProjetEtPeriode.mockResolvedValue({
      id: 'existing',
      statut: 'calculee',
    });
    await expect(useCase.execute('proj-1', '2026-06')).rejects.toThrow(
      /déjà/i,
    );
  });

  it('rejette si projet pas EQUITY', async () => {
    projectRepo.findProjectById.mockResolvedValue({
      modeleEconomique: ModeleEconomique.OBLIGATAIRE,
      statut: ProjectStatus.FINANCE,
      capitalCible: 1,
    });
    await expect(useCase.execute('proj-1', '2026-06')).rejects.toThrow(
      /equity/i,
    );
  });

  it('rejette si projet pas FINANCE', async () => {
    projectRepo.findProjectById.mockResolvedValue({
      modeleEconomique: ModeleEconomique.EQUITY,
      statut: ProjectStatus.BROUILLON,
      capitalCible: 1,
    });
    await expect(useCase.execute('proj-1', '2026-06')).rejects.toThrow(
      /financé/i,
    );
  });

  it('rejette format période invalide', async () => {
    await expect(useCase.execute('proj-1', '2026/06')).rejects.toThrow(
      /YYYY-MM/,
    );
  });

  it('rejette si projet introuvable', async () => {
    projectRepo.findProjectById.mockResolvedValue(null);
    await expect(useCase.execute('x', '2026-06')).rejects.toThrow(/introuvable/);
  });

  it('crée la période sans parts si aucun investissement éligible', async () => {
    investmentRepo.findByProjetId.mockResolvedValue([]);
    const r = await useCase.execute('proj-1', '2026-06');
    expect(r.parts).toHaveLength(0);
    expect(r.periode.statut).toBe(StatutPeriodeDistribution.CALCULEE);
  });
});
