import { ValidateChargeUseCase } from './validate-charge.usecase';
import { StatutDeclaration } from '../../domains/enums/statut-declaration.enum';
import { UserRole } from 'src/iam/domains/enums/user.enum';

describe('ValidateChargeUseCase', () => {
  let useCase: ValidateChargeUseCase;
  let chargeRepo: any;

  const declarePending = () => ({
    id: 'c1',
    statut: StatutDeclaration.DECLARE,
    valideParUserId: null,
    valideLe: null,
    motifRejet: null,
  });

  let auditLog: any;

  beforeEach(() => {
    chargeRepo = {
      findById: jest.fn().mockResolvedValue(declarePending()),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
    };
    auditLog = { create: jest.fn().mockResolvedValue(undefined) };
    useCase = new ValidateChargeUseCase(chargeRepo, auditLog);
  });

  it('validate passe en VALIDE', async () => {
    const r = await useCase.validate('c1', 7);
    expect(r.statut).toBe(StatutDeclaration.VALIDE);
    expect(r.valideParUserId).toBe(7);
    // Sans adminRole fourni, l'audit retombe sur SUPER_ADMIN (compat legacy)
    expect(auditLog.create).toHaveBeenCalledWith(
      '7',
      UserRole.SUPER_ADMIN,
      'equity.charge.validate',
      'charge',
      'c1',
      undefined,
      undefined,
      expect.any(Object),
    );
  });

  it('reject passe en REJETE avec motif', async () => {
    const r = await useCase.reject('c1', 7, 'Facture absente');
    expect(r.statut).toBe(StatutDeclaration.REJETE);
    expect(r.motifRejet).toBe('Facture absente');
  });

  it('reject rejette si motif vide', async () => {
    await expect(useCase.reject('c1', 7, '')).rejects.toThrow(/motif/i);
  });

  it('validate rejette si déjà VALIDE', async () => {
    chargeRepo.findById.mockResolvedValue({
      ...declarePending(),
      statut: StatutDeclaration.VALIDE,
    });
    await expect(useCase.validate('c1', 7)).rejects.toThrow(/DECLARE/);
  });

  it('rejette si introuvable', async () => {
    chargeRepo.findById.mockResolvedValue(null);
    await expect(useCase.validate('x', 7)).rejects.toThrow(/introuvable/);
  });

  it('audite avec le rôle réel de l\'acteur (pas SUPER_ADMIN) quand adminRole est fourni', async () => {
    await useCase.validate('c1', 7, UserRole.CIO);
    expect(auditLog.create).toHaveBeenCalledWith(
      '7',
      UserRole.CIO,
      'equity.charge.validate',
      'charge',
      'c1',
      undefined,
      undefined,
      expect.any(Object),
    );
  });
});
