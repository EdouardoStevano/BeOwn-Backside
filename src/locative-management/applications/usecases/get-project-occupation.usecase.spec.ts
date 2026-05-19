import { GetProjectOccupationUseCase } from './get-project-occupation.usecase';

describe('GetProjectOccupationUseCase', () => {
  let useCase: GetProjectOccupationUseCase;
  let uniteRepo: any;
  let bailRepo: any;

  beforeEach(() => {
    uniteRepo = { findByProjet: jest.fn() };
    bailRepo = { findActifsByProjet: jest.fn() };
    useCase = new GetProjectOccupationUseCase(uniteRepo, bailRepo);
  });

  it('retourne 0% si aucune unité', async () => {
    uniteRepo.findByProjet.mockResolvedValue([]);
    bailRepo.findActifsByProjet.mockResolvedValue([]);
    const r = await useCase.execute('p1');
    expect(r.nbUnitesTotal).toBe(0);
    expect(r.tauxOccupation).toBe(0);
  });

  it('retourne 100% si toutes les unités sont louées', async () => {
    uniteRepo.findByProjet.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    bailRepo.findActifsByProjet.mockResolvedValue([
      { uniteLouableId: 'u1' },
      { uniteLouableId: 'u2' },
    ]);
    const r = await useCase.execute('p1');
    expect(r.tauxOccupation).toBe(1);
    expect(r.nbUnitesLouees).toBe(2);
  });

  it('calcule un taux partiel correctement (2/3 ≈ 0.6667)', async () => {
    uniteRepo.findByProjet.mockResolvedValue([
      { id: 'u1' },
      { id: 'u2' },
      { id: 'u3' },
    ]);
    bailRepo.findActifsByProjet.mockResolvedValue([
      { uniteLouableId: 'u1' },
      { uniteLouableId: 'u3' },
    ]);
    const r = await useCase.execute('p1');
    expect(r.nbUnitesLouees).toBe(2);
    expect(r.tauxOccupation).toBeCloseTo(0.6667, 4);
  });

  it('ignore les baux pointant sur une unité non listée', async () => {
    uniteRepo.findByProjet.mockResolvedValue([{ id: 'u1' }]);
    bailRepo.findActifsByProjet.mockResolvedValue([
      { uniteLouableId: 'u1' },
      { uniteLouableId: 'u-orphan' },
    ]);
    const r = await useCase.execute('p1');
    expect(r.nbUnitesLouees).toBe(1);
  });
});
