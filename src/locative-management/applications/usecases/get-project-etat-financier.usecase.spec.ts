import { GetProjectEtatFinancierUseCase } from './get-project-etat-financier.usecase';

describe('GetProjectEtatFinancierUseCase', () => {
  let useCase: GetProjectEtatFinancierUseCase;
  let loyerRepo: any;
  let chargeRepo: any;

  beforeEach(() => {
    loyerRepo = { findValidesParProjetEtPeriode: jest.fn() };
    chargeRepo = { findValidesParProjetEtPeriode: jest.fn() };
    useCase = new GetProjectEtatFinancierUseCase(loyerRepo, chargeRepo);
  });

  it('agrège 0/0/0 si aucune donnée', async () => {
    loyerRepo.findValidesParProjetEtPeriode.mockResolvedValue([]);
    chargeRepo.findValidesParProjetEtPeriode.mockResolvedValue([]);
    const r = await useCase.execute('p1', '2026-06');
    expect(r).toEqual({
      periode: '2026-06',
      totalLoyers: 0,
      totalCharges: 0,
      revenuNet: 0,
    });
  });

  it('calcule revenuNet = totalLoyers - totalCharges', async () => {
    loyerRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 150_000 },
      { montant: 200_000 },
    ]);
    chargeRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 35_000 },
      { montant: 15_000 },
    ]);
    const r = await useCase.execute('p1', '2026-06');
    expect(r.totalLoyers).toBe(350_000);
    expect(r.totalCharges).toBe(50_000);
    expect(r.revenuNet).toBe(300_000);
  });

  it('revenuNet négatif si charges > loyers', async () => {
    loyerRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 10_000 },
    ]);
    chargeRepo.findValidesParProjetEtPeriode.mockResolvedValue([
      { montant: 50_000 },
    ]);
    const r = await useCase.execute('p1', '2026-06');
    expect(r.revenuNet).toBe(-40_000);
  });
});
