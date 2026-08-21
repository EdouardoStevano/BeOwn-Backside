import { CalculateDistributionPeriodeUseCase } from './calculate-distribution-periode.usecase';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import { ModeleEconomique } from 'src/catalog/domain/enums/modele-economique.enum';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { DEFAULT_FEE_RATES } from 'src/common/platform-fees/platform-fees.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

describe('CalculateDistributionPeriodeUseCase', () => {
  let useCase: CalculateDistributionPeriodeUseCase;
  let periodeRepo: any;
  let partRepo: any;
  let loyerRepo: any;
  let chargeRepo: any;
  let projectRepo: any;
  let investmentRepo: any;
  let platformFees: any;

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

    // Mock PlatformFeesService : mêmes formules que le vrai service,
    // paramétrées par le snapshot passé en argument.
    platformFees = {
      getRates: jest.fn().mockResolvedValue({ ...DEFAULT_FEE_RATES }),
      computeMonthlyPlatformFee: jest.fn(
        async (capital: number, rates: any) =>
          round2((capital * (rates.annualPlatformFeePct / 100)) / 12),
      ),
      computeRentManagementFee: jest.fn(async (loyers: number, rates: any) =>
        loyers <= 0 ? 0 : round2(loyers * (rates.rentManagementFeePct / 100)),
      ),
    };

    // Note : le usecase n'a plus de dépendance DataSource/wallet/transaction
    // — le calcul ne fait QUE persister les montants de frais sur la
    // période ; il ne les encaisse jamais (voir ExecuteDistributionUseCase).
    useCase = new CalculateDistributionPeriodeUseCase(
      periodeRepo,
      partRepo,
      loyerRepo,
      chargeRepo,
      projectRepo,
      investmentRepo,
      platformFees,
    );
  });

  it('calcule revenuNet = loyers − charges − frais plateforme (annuel/12 sur capital initial) − gestion locative (7 % des loyers)', async () => {
    loyerRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 600_000 },
      { montant: 400_000 },
    ]);
    chargeRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 150_000 },
    ]);
    const r = await useCase.execute('proj-1', '2026-06');
    expect(r.periode.totalLoyers).toBe(1_000_000);
    // plateforme_annuel = 1 000 000 (capitalCible) × 1 %/12 = 833.33
    // gestion_locative  = 1 000 000 (loyers) × 7 % = 70 000
    // totalCharges = 150 000 + 833.33 + 70 000 = 220 833.33
    expect(r.periode.totalCharges).toBeCloseTo(220_833.33, 2);
    expect(r.periode.revenuNet).toBeCloseTo(779_166.67, 2);
    expect(r.periode.statut).toBe(StatutPeriodeDistribution.CALCULEE);
  });

  it('calcule les deux frais depuis UN SEUL snapshot de taux et les PERSISTE sur la période sans les encaisser', async () => {
    loyerRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 1_000_000 },
    ]);
    const r = await useCase.execute('proj-1', '2026-06');

    // Un seul read des taux pour toute l'opération (R1)
    expect(platformFees.getRates).toHaveBeenCalledTimes(1);
    const snapshot = await platformFees.getRates.mock.results[0].value;
    expect(platformFees.computeMonthlyPlatformFee).toHaveBeenCalledWith(
      1_000_000,
      snapshot,
    );
    expect(platformFees.computeRentManagementFee).toHaveBeenCalledWith(
      1_000_000,
      snapshot,
    );

    // Les montants sont persistés sur la période...
    expect(r.periode.fraisPlateformeAnnuel).toBeCloseTo(833.33, 2);
    expect(r.periode.fraisGestionLocative).toBeCloseTo(70_000, 2);
    expect(r.periode.fraisPlafonnes).toBe(false);
    // ... mais AUCUN wallet/transaction n'est écrit au calcul : le seul
    // write est celui de la période elle-même (periodeRepo.save), pas de
    // dataSource/em.save de transaction FRAIS_PLATEFORME.
    expect(periodeRepo.save).toHaveBeenCalledTimes(1);
  });

  it('plafonne les frais au revenu distribuable (proportionnellement, fraisPlafonnes:true)', async () => {
    loyerRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 1000 },
    ]);
    chargeRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 900 },
    ]);
    const r = await useCase.execute('proj-1', '2026-06');

    // Frais théoriques : 833.33 (plateforme) + 70 (gestion) = 903.33
    // Revenu disponible : 1000 − 900 = 100 → plafonnement proportionnel :
    // plateforme = round2(833.33 × 100/903.33) = 92.25 ; gestion = 100 − 92.25 = 7.75
    expect(r.periode.fraisPlateformeAnnuel).toBeCloseTo(92.25, 2);
    expect(r.periode.fraisGestionLocative).toBeCloseTo(7.75, 2);
    expect(r.periode.fraisPlafonnes).toBe(true);
    // Les frais consomment tout le revenu disponible : rien à distribuer
    expect(r.periode.revenuNet).toBe(0);
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
    // revenuNet = 1 000 000 − 833.33 − 70 000 = 929 166.67 → inv-1 (50 %) ≈ 464 583.33
    expect(r.parts[0].montantBrut).toBeCloseTo(464_583.33, 1);
    expect(r.parts[1].pourcentageDetention).toBe(0.3);
    expect(r.parts[1].montantBrut).toBeCloseTo(278_750, 1);
  });

  it('applique IR 12.8% + CSG 17.2% sur brut positif (après frais plateforme)', async () => {
    loyerRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 100_000 },
    ]);
    investmentRepo.findByProjetId.mockResolvedValue([
      { id: 'inv-1', montant: 1_000_000, statut: InvestmentStatus.CONFIRME },
    ]);
    const r = await useCase.execute('proj-1', '2026-06');
    // frais = 833.33 (plateforme) + 7 000 (gestion 7 % de 100 000)
    // revenuNet = 100 000 − 7 833.33 = 92 166.67
    expect(r.parts[0].montantBrut).toBeCloseTo(92_166.67, 2);
    expect(r.parts[0].prelevementIR).toBeCloseTo(11_797.33, 2);
    expect(r.parts[0].prelevementCSG).toBeCloseTo(15_852.67, 2);
    expect(r.parts[0].montantNet).toBeCloseTo(64_516.67, 2);
  });

  it('ne prélève ni frais ni IR/CSG sur période déficitaire', async () => {
    chargeRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 200_000 },
    ]);
    investmentRepo.findByProjetId.mockResolvedValue([
      { id: 'inv-1', montant: 1_000_000, statut: InvestmentStatus.CONFIRME },
    ]);
    const r = await useCase.execute('proj-1', '2026-06');
    // Aucun loyer, 200 000 de charges : frais plafonnés à 0
    expect(r.periode.fraisPlateformeAnnuel).toBe(0);
    expect(r.periode.fraisGestionLocative).toBe(0);
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
