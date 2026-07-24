import { DeclareChargeUseCase } from './declare-charge.usecase';
import { StatutDeclaration } from '../../domains/enums/statut-declaration.enum';
import { TypeCharge } from '../../domains/enums/type-charge.enum';

describe('DeclareChargeUseCase', () => {
  let useCase: DeclareChargeUseCase;
  let chargeRepo: any;

  beforeEach(() => {
    chargeRepo = {
      save: jest
        .fn()
        .mockImplementation((c) => Promise.resolve({ ...c, id: 'new' })),
    };
    useCase = new DeclareChargeUseCase(chargeRepo);
  });

  const valid = {
    projetId: 'p1',
    type: TypeCharge.MAINTENANCE,
    description: 'Réparation chaudière',
    montant: 35_000,
    periode: '2026-05',
    dateOperation: new Date('2026-05-15'),
    justificatifs: ['https://x/facture.pdf'],
    declareParUserId: 7,
  };

  it('crée une charge en statut DECLARE', async () => {
    const result = await useCase.execute(valid);
    expect(result.statut).toBe(StatutDeclaration.DECLARE);
    expect(chargeRepo.save).toHaveBeenCalled();
  });

  it('rejette périodicité invalide', async () => {
    await expect(
      useCase.execute({ ...valid, periode: '06-2026' }),
    ).rejects.toThrow(/YYYY-MM/);
  });

  it('rejette montant négatif', async () => {
    await expect(useCase.execute({ ...valid, montant: -1 })).rejects.toThrow(
      /positif/i,
    );
  });

  it('rejette sans justificatif', async () => {
    await expect(
      useCase.execute({ ...valid, justificatifs: [] }),
    ).rejects.toThrow(/justificatif/i);
  });
});
