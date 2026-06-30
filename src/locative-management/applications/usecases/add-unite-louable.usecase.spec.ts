import {
  AddUniteLouableUseCase,
  AddUniteLouableInput,
} from './add-unite-louable.usecase';
import { UniteLouable } from '../../domains/unite-louable';

describe('AddUniteLouableUseCase', () => {
  let useCase: AddUniteLouableUseCase;
  let uniteRepo: any;

  beforeEach(() => {
    uniteRepo = {
      save: jest
        .fn()
        .mockImplementation((u: UniteLouable) =>
          Promise.resolve({ ...u, id: 'new-id' }),
        ),
    };
    useCase = new AddUniteLouableUseCase(uniteRepo);
  });

  it('crée une unité avec les champs fournis', async () => {
    const input: AddUniteLouableInput = {
      projetId: 'proj-1',
      reference: 'Apt 3B',
      surfaceM2: 65,
      loyerMensuelCible: 150_000,
    };
    const result = await useCase.execute(input);
    expect(result.id).toBe('new-id');
    expect(uniteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        projetId: 'proj-1',
        reference: 'Apt 3B',
        surfaceM2: 65,
        loyerMensuelCible: 150_000,
      }),
    );
  });

  it('accepte une surface null', async () => {
    await useCase.execute({
      projetId: 'p',
      reference: 'Lot 1',
      surfaceM2: null,
      loyerMensuelCible: 100,
    });
    expect(uniteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ surfaceM2: null }),
    );
  });

  it('rejette un loyerMensuelCible négatif', async () => {
    await expect(
      useCase.execute({
        projetId: 'p',
        reference: 'X',
        surfaceM2: null,
        loyerMensuelCible: -100,
      }),
    ).rejects.toThrow(/positif/i);
  });

  it('rejette un loyerMensuelCible nul', async () => {
    await expect(
      useCase.execute({
        projetId: 'p',
        reference: 'X',
        surfaceM2: null,
        loyerMensuelCible: 0,
      }),
    ).rejects.toThrow(/positif/i);
  });
});
