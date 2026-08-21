import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { StatutSortie } from 'src/projects/domains/enums/statut-sortie.enum';
import {
  ChampSortieInvalideError,
  ModeleEconomiqueNonEquityError,
  ProjetIntrouvableError,
  ProjetNonFinanceError,
  SortieDejaEnCoursError,
} from 'src/projects/domains/errors';
import { SortieProjetFactory } from 'src/projects/domains/factories/sortie-projet.factory';
import { DeclareSortieUseCase } from './declare-sortie.usecase';

const projetEligible = {
  id: 'p1',
  modeleEconomique: ModeleEconomique.EQUITY,
  statut: ProjectStatus.FINANCE,
  capitalCible: 200_000_000,
};

const sortieAvecStatut = (statut: StatutSortie) => {
  const sortie = SortieProjetFactory.declarer({
    projetId: 'p1',
    prixRevente: 1,
    dateRevente: new Date(),
    capitalCible: 1,
    acteVentePdfUrl:
      statut === StatutSortie.PROJETEE ? null : 'https://x/acte.pdf',
  });
  if (statut === StatutSortie.ANNULEE) sortie.annuler();
  if (statut === StatutSortie.DISTRIBUEE) sortie.marquerDistribuee();
  return sortie;
};

describe('DeclareSortieUseCase', () => {
  let useCase: DeclareSortieUseCase;
  let projectRepo: { findProjectById: jest.Mock };
  let sortieRepo: { findByProjet: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    projectRepo = {
      findProjectById: jest.fn().mockResolvedValue(projetEligible),
    };
    sortieRepo = {
      findByProjet: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    };
    useCase = new DeclareSortieUseCase(
      projectRepo as never,
      sortieRepo as never,
    );
  });

  const declarer = (surcharge: Record<string, unknown> = {}) =>
    useCase.execute({
      projetId: 'p1',
      prixRevente: 260_000_000,
      dateRevente: new Date('2031-05-15'),
      ...surcharge,
    });

  it('crée une sortie PROJETEE avec plus-value calculée', async () => {
    const sortie = await declarer();
    expect(sortie.plusValueBrute).toBe(60_000_000);
    expect(sortie.statut).toBe(StatutSortie.PROJETEE);
  });

  it('crée une sortie ACTEE si acteVentePdfUrl fourni', async () => {
    const sortie = await declarer({ acteVentePdfUrl: 'https://x/acte.pdf' });
    expect(sortie.statut).toBe(StatutSortie.ACTEE);
  });

  it('plus-value négative (moins-value) acceptée', async () => {
    const sortie = await declarer({ prixRevente: 180_000_000 });
    expect(sortie.plusValueBrute).toBe(-20_000_000);
  });

  it('rejette un projet introuvable', async () => {
    projectRepo.findProjectById.mockResolvedValue(null);
    await expect(declarer()).rejects.toThrow(ProjetIntrouvableError);
  });

  it('rejette si projet pas EQUITY', async () => {
    projectRepo.findProjectById.mockResolvedValue({
      ...projetEligible,
      modeleEconomique: ModeleEconomique.OBLIGATAIRE,
    });
    await expect(declarer()).rejects.toThrow(ModeleEconomiqueNonEquityError);
  });

  it('rejette si projet pas FINANCE', async () => {
    projectRepo.findProjectById.mockResolvedValue({
      ...projetEligible,
      statut: ProjectStatus.BROUILLON,
    });
    await expect(declarer()).rejects.toThrow(ProjetNonFinanceError);
  });

  it('rejette un prix de revente négatif', async () => {
    await expect(declarer({ prixRevente: -10 })).rejects.toThrow(
      ChampSortieInvalideError,
    );
  });

  it.each([StatutSortie.PROJETEE, StatutSortie.ACTEE])(
    'rejette si une sortie %s occupe déjà le projet',
    async (statut) => {
      sortieRepo.findByProjet.mockResolvedValue([sortieAvecStatut(statut)]);
      await expect(declarer()).rejects.toThrow(SortieDejaEnCoursError);
    },
  );

  it('accepte si seules les sorties existantes sont ANNULEE', async () => {
    sortieRepo.findByProjet.mockResolvedValue([
      sortieAvecStatut(StatutSortie.ANNULEE),
    ]);
    await expect(declarer()).resolves.toBeDefined();
  });
});
