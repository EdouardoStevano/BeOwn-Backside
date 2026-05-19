import { ValidateLoyerEncaisseUseCase } from './validate-loyer-encaisse.usecase';
import { StatutDeclaration } from '../../domains/enums/statut-declaration.enum';

describe('ValidateLoyerEncaisseUseCase', () => {
  let useCase: ValidateLoyerEncaisseUseCase;
  let loyerRepo: any;

  const declarePending = () => ({
    id: 'l1',
    statut: StatutDeclaration.DECLARE,
    valideParUserId: null,
    valideLe: null,
    motifRejet: null,
  });

  beforeEach(() => {
    loyerRepo = {
      findById: jest.fn().mockResolvedValue(declarePending()),
      save: jest.fn().mockImplementation((l) => Promise.resolve(l)),
    };
    useCase = new ValidateLoyerEncaisseUseCase(loyerRepo);
  });

  describe('validate', () => {
    it('passe en statut VALIDE avec audit fields', async () => {
      const result = await useCase.validate('l1', 99);
      expect(result.statut).toBe(StatutDeclaration.VALIDE);
      expect(result.valideParUserId).toBe(99);
      expect(result.valideLe).toBeInstanceOf(Date);
    });

    it('rejette si statut ≠ DECLARE', async () => {
      loyerRepo.findById.mockResolvedValue({
        ...declarePending(),
        statut: StatutDeclaration.VALIDE,
      });
      await expect(useCase.validate('l1', 99)).rejects.toThrow(/DECLARE/);
    });

    it('rejette si introuvable', async () => {
      loyerRepo.findById.mockResolvedValue(null);
      await expect(useCase.validate('x', 99)).rejects.toThrow(/introuvable/);
    });
  });

  describe('reject', () => {
    it('passe en statut REJETE avec motif', async () => {
      const result = await useCase.reject('l1', 99, 'Preuve illisible');
      expect(result.statut).toBe(StatutDeclaration.REJETE);
      expect(result.motifRejet).toBe('Preuve illisible');
      expect(result.valideParUserId).toBe(99);
    });

    it('rejette si motif vide', async () => {
      await expect(useCase.reject('l1', 99, '   ')).rejects.toThrow(/motif/i);
    });

    it('rejette si statut ≠ DECLARE', async () => {
      loyerRepo.findById.mockResolvedValue({
        ...declarePending(),
        statut: StatutDeclaration.REJETE,
      });
      await expect(useCase.reject('l1', 99, 'x')).rejects.toThrow(/DECLARE/);
    });
  });
});
