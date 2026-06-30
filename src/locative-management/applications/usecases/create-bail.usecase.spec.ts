import { CreateBailUseCase } from './create-bail.usecase';
import { StatutBail } from '../../domains/enums/statut-bail.enum';

describe('CreateBailUseCase', () => {
  let useCase: CreateBailUseCase;
  let bailRepo: any;
  let locataireRepo: any;
  let uniteRepo: any;

  beforeEach(() => {
    bailRepo = {
      save: jest
        .fn()
        .mockImplementation((b) => Promise.resolve({ ...b, id: 'bail-1' })),
    };
    locataireRepo = {
      save: jest
        .fn()
        .mockImplementation((l) => Promise.resolve({ ...l, id: 'loc-1' })),
    };
    uniteRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'u1' }),
    };
    useCase = new CreateBailUseCase(bailRepo, locataireRepo, uniteRepo);
  });

  it('crée le locataire puis le bail en statut ACTIF', async () => {
    const result = await useCase.execute({
      uniteLouableId: 'u1',
      locataire: { nomComplet: 'Jean Dupont', email: 'j@d.com' },
      loyerMensuel: 150_000,
      dateDebut: new Date('2026-06-01'),
      spvId: 'spv-1',
    });
    expect(locataireRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        nomComplet: 'Jean Dupont',
        email: 'j@d.com',
        spvId: 'spv-1',
      }),
    );
    expect(bailRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        locataireId: 'loc-1',
        loyerMensuel: 150_000,
        statut: StatutBail.ACTIF,
      }),
    );
    expect(result.id).toBe('bail-1');
  });

  it('rejette si unité introuvable', async () => {
    uniteRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        uniteLouableId: 'x',
        locataire: { nomComplet: 'X' },
        loyerMensuel: 100,
        dateDebut: new Date(),
        spvId: 's',
      }),
    ).rejects.toThrow(/unité/i);
  });

  it('rejette si loyer ≤ 0', async () => {
    await expect(
      useCase.execute({
        uniteLouableId: 'u1',
        locataire: { nomComplet: 'X' },
        loyerMensuel: 0,
        dateDebut: new Date(),
        spvId: 's',
      }),
    ).rejects.toThrow(/positif/i);
  });
});
