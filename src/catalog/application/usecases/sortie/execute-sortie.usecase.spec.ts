import { UserRole } from 'src/iam/domain/enums/user.enum';
import { BaremeDesFrais } from 'src/treasury/domain/value-objects/bareme-des-frais.vo';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import { StatutSortie } from 'src/catalog/domain/enums/statut-sortie.enum';
import {
  ProjetIntrouvableError,
  SortieIntrouvableError,
  TransitionSortieInvalideError,
} from 'src/catalog/domain/errors';
import { ProjectFactory } from 'src/catalog/domain/factories/project.factory';
import {
  ProjectInstrument,
  ProjectType,
} from 'src/catalog/domain/enums/project-status.enum';
import { ModeleEconomique } from 'src/catalog/domain/enums/modele-economique.enum';
import { SortieProjetFactory } from 'src/catalog/domain/factories/sortie-projet.factory';
import { ExecuteSortieUseCase } from './execute-sortie.usecase';

const CAPITAL_CIBLE = 100_000;

function projetFinance() {
  const projet = ProjectFactory.creer({
    titre: 'Résidence Horizon',
    type: ProjectType.RESIDENTIEL,
    capitalCible: CAPITAL_CIBLE,
    capitalMinimum: CAPITAL_CIBLE,
    dureeMois: 24,
    instrument: ProjectInstrument.ACTION,
    modeleEconomique: ModeleEconomique.EQUITY,
  });
  projet.changerStatut(ProjectStatus.ANNONCE);
  projet.changerStatut(ProjectStatus.EN_COLLECTE);
  projet.changerStatut(ProjectStatus.FINANCE);
  return projet;
}

function sortieActee(plusValueBrute = 0) {
  return SortieProjetFactory.declarer({
    projetId: 'p1',
    prixRevente: CAPITAL_CIBLE + plusValueBrute,
    dateRevente: new Date('2031-05-15'),
    capitalCible: CAPITAL_CIBLE,
    acteVentePdfUrl: 'https://x/acte.pdf',
  });
}

function makeDeps(
  options: { plusValueBrute?: number; investissements?: unknown[] } = {},
) {
  const sortie = sortieActee(options.plusValueBrute ?? 0);
  const projet = projetFinance();

  const sortieRepo = {
    findById: jest.fn().mockResolvedValue(sortie),
    save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
  };
  const projectRepo = {
    findProjectById: jest.fn().mockResolvedValue(projet),
    saveProject: jest.fn().mockImplementation((p) => Promise.resolve(p)),
  };
  const investmentRepo = {
    findByProjetId: jest.fn().mockResolvedValue(options.investissements ?? []),
  };
  const settlement = {
    regler: jest
      .fn()
      .mockImplementation(({ versements }) =>
        Promise.resolve({ versementsEffectues: versements }),
      ),
  };
  const auditLog = { create: jest.fn().mockResolvedValue(undefined) };
  const amlMonitor = { check: jest.fn().mockResolvedValue(undefined) };
  // Le **vrai** barème plutôt qu'une doublure : il porte désormais la règle
  // (0 sur une moins-value, 15 % au-delà), et la réimplémenter dans le montage
  // reviendrait à éprouver la copie plutôt que l'original.
  const platformFees = {
    lireLeBareme: jest
      .fn()
      .mockResolvedValue(
        BaremeDesFrais.restore({ propertySaleGainFeePct: 15 }),
      ),
  };

  const useCase = new ExecuteSortieUseCase(
    sortieRepo as never,
    projectRepo as never,
    investmentRepo as never,
    settlement as never,
    auditLog as never,
    amlMonitor as never,
    platformFees as never,
  );

  return {
    useCase,
    sortie,
    projet,
    sortieRepo,
    projectRepo,
    investmentRepo,
    settlement,
    auditLog,
    amlMonitor,
    platformFees,
  };
}

describe('ExecuteSortieUseCase', () => {
  describe('préconditions', () => {
    it('rejette une sortie inconnue', async () => {
      const { useCase, sortieRepo } = makeDeps();
      sortieRepo.findById.mockResolvedValue(null);
      await expect(useCase.execute('s1')).rejects.toThrow(
        SortieIntrouvableError,
      );
    });

    it('rejette une sortie qui n’est pas actée', async () => {
      const { useCase, sortieRepo, sortie } = makeDeps();
      sortie.annuler();
      sortieRepo.findById.mockResolvedValue(sortie);
      await expect(useCase.execute('s1')).rejects.toThrow(
        TransitionSortieInvalideError,
      );
    });

    it('rejette un projet introuvable', async () => {
      const { useCase, projectRepo } = makeDeps();
      projectRepo.findProjectById.mockResolvedValue(null);
      await expect(useCase.execute('s1')).rejects.toThrow(
        ProjetIntrouvableError,
      );
    });
  });

  describe('distribution', () => {
    const investissements = [
      {
        id: 'i1',
        utilisateurId: 1,
        montant: 60_000,
        statut: InvestmentStatus.CONFIRME,
      },
      {
        id: 'i2',
        utilisateurId: 2,
        montant: 40_000,
        statut: InvestmentStatus.CONFIRME,
      },
      // Ignoré : seuls les investissements confirmés donnent droit à une part.
      {
        id: 'i3',
        utilisateurId: 3,
        montant: 99_000,
        statut: InvestmentStatus.ANNULE,
      },
    ];

    it('ne retient que les investissements confirmés', async () => {
      const { useCase, settlement } = makeDeps({ investissements });

      await useCase.execute('s1');

      const ordre = settlement.regler.mock.calls[0][0];
      expect(
        ordre.versements.map(
          (v: { investissementId: string }) => v.investissementId,
        ),
      ).toEqual(['i1', 'i2']);
    });

    it('distribue la plus-value nette des frais de performance', async () => {
      // PV brute 10 000 → frais 15 % = 1 500 → distribuable 8 500,
      // dont 60 % pour i1.
      const { useCase, settlement } = makeDeps({
        plusValueBrute: 10_000,
        investissements,
      });

      const resultat = await useCase.execute('s1');

      const ordre = settlement.regler.mock.calls[0][0];
      expect(ordre.fraisPerformance).toBe(1_500);
      expect(ordre.versements[0].plusValuePart).toBe(5_100);
      expect(resultat.performanceFeePrelevee).toBe(1_500);
      expect(resultat.totalPlusValueDistribuee).toBe(8_500);
    });

    it('ne totalise que les versements réellement passés', async () => {
      const { useCase, settlement } = makeDeps({ investissements });
      // L'adapter ignore un investisseur sans wallet.
      settlement.regler.mockImplementation(({ versements }) =>
        Promise.resolve({ versementsEffectues: [versements[0]] }),
      );

      const resultat = await useCase.execute('s1');

      expect(resultat.nbInvestisseursPayes).toBe(1);
      expect(resultat.totalCapitalRembourse).toBe(60_000);
    });

    it('surveille chaque versement au titre de la LCB-FT', async () => {
      const { useCase, amlMonitor } = makeDeps({ investissements });

      await useCase.execute('s1');

      expect(amlMonitor.check).toHaveBeenCalledTimes(2);
      expect(amlMonitor.check).toHaveBeenCalledWith(
        expect.objectContaining({ context: 'sortie', reference: 's1:i1' }),
      );
    });
  });

  describe('transitions finales', () => {
    it('marque la sortie distribuée et clôture le projet, après le règlement', async () => {
      const { useCase, sortie, projet, settlement } = makeDeps();

      await useCase.execute('s1');

      expect(settlement.regler).toHaveBeenCalled();
      expect(sortie.statut).toBe(StatutSortie.DISTRIBUEE);
      expect(projet.statut).toBe(ProjectStatus.CLOTURE);
    });

    it('ne transitionne rien si le règlement échoue', async () => {
      const { useCase, sortie, projet, settlement, sortieRepo } = makeDeps();
      settlement.regler.mockRejectedValue(new Error('wallets indisponibles'));

      await expect(useCase.execute('s1')).rejects.toThrow(
        'wallets indisponibles',
      );
      expect(sortie.statut).toBe(StatutSortie.ACTEE);
      expect(projet.statut).toBe(ProjectStatus.FINANCE);
      expect(sortieRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('audit', () => {
    it('audite avec SUPER_ADMIN quand adminRole est omis', async () => {
      const { useCase, auditLog } = makeDeps();

      await useCase.execute('s1', 7);

      expect(auditLog.create).toHaveBeenCalledWith(
        '7',
        UserRole.SUPER_ADMIN,
        'equity.sortie.execute',
        'sortie_projet',
        's1',
        undefined,
        undefined,
        expect.any(Object),
      );
    });

    it("audite avec le rôle réel de l'acteur quand adminRole est fourni", async () => {
      const { useCase, auditLog } = makeDeps();

      await useCase.execute('s1', 7, UserRole.CIO);

      expect(auditLog.create).toHaveBeenCalledWith(
        '7',
        UserRole.CIO,
        'equity.sortie.execute',
        'sortie_projet',
        's1',
        undefined,
        undefined,
        expect.any(Object),
      );
    });

    it("n'audite pas une exécution sans acteur identifié", async () => {
      const { useCase, auditLog } = makeDeps();

      await useCase.execute('s1');

      expect(auditLog.create).not.toHaveBeenCalled();
    });
  });
});
