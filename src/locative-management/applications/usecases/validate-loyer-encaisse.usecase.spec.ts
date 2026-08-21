import { ValidateLoyerEncaisseUseCase } from './validate-loyer-encaisse.usecase';
import { StatutDeclaration } from '../../domains/enums/statut-declaration.enum';
import { UserRole } from 'src/iam/domain/enums/user.enum';

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

  let auditLog: any;

  beforeEach(() => {
    loyerRepo = {
      findById: jest.fn().mockResolvedValue(declarePending()),
      save: jest.fn().mockImplementation((l) => Promise.resolve(l)),
    };
    auditLog = { create: jest.fn().mockResolvedValue(undefined) };
    useCase = new ValidateLoyerEncaisseUseCase(loyerRepo, auditLog);
  });

  describe('validate', () => {
    it('passe en statut VALIDE avec audit fields', async () => {
      const result = await useCase.validate('l1', 99);
      expect(result.statut).toBe(StatutDeclaration.VALIDE);
      expect(result.valideParUserId).toBe(99);
      expect(result.valideLe).toBeInstanceOf(Date);
      // Sans adminRole fourni, l'audit retombe sur SUPER_ADMIN (compat legacy)
      expect(auditLog.create).toHaveBeenCalledWith(
        '99',
        UserRole.SUPER_ADMIN,
        'equity.loyer.validate',
        'loyer_encaisse',
        'l1',
        undefined,
        undefined,
        expect.any(Object),
      );
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

    it('audite avec le rôle réel de l\'acteur (pas SUPER_ADMIN) quand adminRole est fourni', async () => {
      await useCase.validate('l1', 99, UserRole.CIO);
      expect(auditLog.create).toHaveBeenCalledWith(
        '99',
        UserRole.CIO,
        'equity.loyer.validate',
        'loyer_encaisse',
        'l1',
        undefined,
        undefined,
        expect.any(Object),
      );
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
