import { ValidatePeriodeDistributionUseCase } from './validate-periode-distribution.usecase';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';

describe('ValidatePeriodeDistributionUseCase', () => {
  let useCase: ValidatePeriodeDistributionUseCase;
  let periodeRepo: any;

  const calculee = () => ({
    id: 'pd-1',
    statut: StatutPeriodeDistribution.CALCULEE,
    valideeLe: null,
    distribueeLe: null,
  });

  beforeEach(() => {
    periodeRepo = {
      findById: jest.fn().mockResolvedValue(calculee()),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    };
    useCase = new ValidatePeriodeDistributionUseCase(periodeRepo);
  });

  describe('validate', () => {
    it('passe CALCULEE → VALIDEE et set valideeLe', async () => {
      const r = await useCase.validate('pd-1');
      expect(r.statut).toBe(StatutPeriodeDistribution.VALIDEE);
      expect(r.valideeLe).toBeInstanceOf(Date);
    });

    it('rejette si statut ≠ CALCULEE', async () => {
      periodeRepo.findById.mockResolvedValue({
        ...calculee(),
        statut: StatutPeriodeDistribution.VALIDEE,
      });
      await expect(useCase.validate('pd-1')).rejects.toThrow(/CALCULEE/);
    });

    it('rejette si introuvable', async () => {
      periodeRepo.findById.mockResolvedValue(null);
      await expect(useCase.validate('x')).rejects.toThrow(/introuvable/);
    });
  });

  describe('cancel', () => {
    it('annule une CALCULEE', async () => {
      const r = await useCase.cancel('pd-1');
      expect(r.statut).toBe(StatutPeriodeDistribution.ANNULEE);
    });

    it('annule une VALIDEE', async () => {
      periodeRepo.findById.mockResolvedValue({
        ...calculee(),
        statut: StatutPeriodeDistribution.VALIDEE,
      });
      const r = await useCase.cancel('pd-1');
      expect(r.statut).toBe(StatutPeriodeDistribution.ANNULEE);
    });

    it('rejette annulation d\'une DISTRIBUEE', async () => {
      periodeRepo.findById.mockResolvedValue({
        ...calculee(),
        statut: StatutPeriodeDistribution.DISTRIBUEE,
      });
      await expect(useCase.cancel('pd-1')).rejects.toThrow(/exécutée/);
    });

    it('annule une période dont les frais ont déjà été calculés sans y toucher — rien à reverser (money-free)', async () => {
      // Les frais sont calculés (snapshot) mais jamais encaissés avant
      // l'exécution : annuler une CALCULEE/VALIDEE n'a donc besoin d'aucun
      // wallet/transaction repo — ce usecase n'en dépend d'ailleurs pas.
      periodeRepo.findById.mockResolvedValue({
        ...calculee(),
        fraisPlateformeAnnuel: 833.33,
        fraisGestionLocative: 70_000,
        fraisPlafonnes: false,
      });
      const r = await useCase.cancel('pd-1');
      expect(r.statut).toBe(StatutPeriodeDistribution.ANNULEE);
      // Le save reflète l'annulation, mais rien d'autre n'a été mobilisé
      // (aucune dépendance wallet/transaction dans ce usecase).
      expect(periodeRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
