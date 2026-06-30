import { DeclareLoyerEncaisseUseCase } from './declare-loyer-encaisse.usecase';
import { StatutDeclaration } from '../../domains/enums/statut-declaration.enum';

describe('DeclareLoyerEncaisseUseCase', () => {
  let useCase: DeclareLoyerEncaisseUseCase;
  let loyerRepo: any;
  let bailRepo: any;

  beforeEach(() => {
    loyerRepo = {
      findByBailEtPeriode: jest.fn().mockResolvedValue(null),
      save: jest
        .fn()
        .mockImplementation((l) => Promise.resolve({ ...l, id: 'new' })),
    };
    bailRepo = { findById: jest.fn().mockResolvedValue({ id: 'b1' }) };
    useCase = new DeclareLoyerEncaisseUseCase(loyerRepo, bailRepo);
  });

  const valid = {
    bailId: 'b1',
    periode: '2026-06',
    montant: 150_000,
    dateEncaissement: new Date('2026-06-05'),
    preuves: ['https://x/rb.pdf'],
    declareParUserId: 42,
  };

  it('crée un loyer en statut DECLARE', async () => {
    const result = await useCase.execute(valid);
    expect(result.statut).toBe(StatutDeclaration.DECLARE);
    expect(loyerRepo.save).toHaveBeenCalled();
  });

  it('rejette si bail introuvable', async () => {
    bailRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute(valid)).rejects.toThrow(/bail/i);
  });

  it('rejette si déclaration existe déjà pour (bail, période)', async () => {
    loyerRepo.findByBailEtPeriode.mockResolvedValue({ id: 'existing' });
    await expect(useCase.execute(valid)).rejects.toThrow(/déjà/i);
  });

  it('rejette périodicité invalide', async () => {
    await expect(
      useCase.execute({ ...valid, periode: '2026/06' }),
    ).rejects.toThrow(/YYYY-MM/);
  });

  it('rejette si aucune preuve', async () => {
    await expect(useCase.execute({ ...valid, preuves: [] })).rejects.toThrow(
      /preuve/i,
    );
  });

  it('rejette montant ≤ 0', async () => {
    await expect(useCase.execute({ ...valid, montant: 0 })).rejects.toThrow(
      /positif/i,
    );
  });
});
