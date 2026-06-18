import { DeclareSortieUseCase } from './declare-sortie.usecase';
import { StatutSortie } from '../../domains/sortie-projet';
import { ModeleEconomique } from '../../domains/enums/modele-economique.enum';
import { ProjectStatus } from '../../domains/enums/project-status.enum';

describe('DeclareSortieUseCase', () => {
  let useCase: DeclareSortieUseCase;
  let projectRepo: any;
  let sortieRepo: any;

  beforeEach(() => {
    projectRepo = {
      findProjectById: jest.fn().mockResolvedValue({
        id: 'p1',
        modeleEconomique: ModeleEconomique.EQUITY,
        statut: ProjectStatus.FINANCE,
        capitalCible: 200_000_000,
      }),
    };
    sortieRepo = {
      findByProjet: jest.fn().mockResolvedValue([]),
      save: jest
        .fn()
        .mockImplementation((s) => Promise.resolve({ ...s, id: 's1' })),
    };
    useCase = new DeclareSortieUseCase(projectRepo, sortieRepo);
  });

  it('crée une sortie PROJETEE avec plus-value calculée', async () => {
    const r = await useCase.execute({
      projetId: 'p1',
      prixRevente: 260_000_000,
      dateRevente: new Date('2031-05-15'),
    });
    expect(r.plusValueBrute).toBe(60_000_000);
    expect(r.statut).toBe(StatutSortie.PROJETEE);
  });

  it('crée une sortie ACTEE si acteVentePdfUrl fourni', async () => {
    const r = await useCase.execute({
      projetId: 'p1',
      prixRevente: 260_000_000,
      dateRevente: new Date('2031-05-15'),
      acteVentePdfUrl: 'https://x/acte.pdf',
    });
    expect(r.statut).toBe(StatutSortie.ACTEE);
  });

  it('plus-value négative (moins-value) acceptée', async () => {
    const r = await useCase.execute({
      projetId: 'p1',
      prixRevente: 180_000_000,
      dateRevente: new Date('2031-05-15'),
    });
    expect(r.plusValueBrute).toBe(-20_000_000);
  });

  it('rejette si projet pas EQUITY', async () => {
    projectRepo.findProjectById.mockResolvedValue({
      modeleEconomique: ModeleEconomique.OBLIGATAIRE,
      statut: ProjectStatus.FINANCE,
      capitalCible: 1,
    });
    await expect(
      useCase.execute({
        projetId: 'p1',
        prixRevente: 100,
        dateRevente: new Date(),
      }),
    ).rejects.toThrow(/EQUITY/);
  });

  it('rejette si projet pas FINANCE', async () => {
    projectRepo.findProjectById.mockResolvedValue({
      modeleEconomique: ModeleEconomique.EQUITY,
      statut: ProjectStatus.BROUILLON,
      capitalCible: 1,
    });
    await expect(
      useCase.execute({
        projetId: 'p1',
        prixRevente: 100,
        dateRevente: new Date(),
      }),
    ).rejects.toThrow(/FINANCE/);
  });

  it('rejette prix de revente négatif', async () => {
    await expect(
      useCase.execute({
        projetId: 'p1',
        prixRevente: -10,
        dateRevente: new Date(),
      }),
    ).rejects.toThrow(/positif/);
  });

  it('rejette si sortie déjà en cours sur ce projet', async () => {
    sortieRepo.findByProjet.mockResolvedValue([
      { statut: StatutSortie.ACTEE },
    ]);
    await expect(
      useCase.execute({
        projetId: 'p1',
        prixRevente: 100,
        dateRevente: new Date(),
      }),
    ).rejects.toThrow(/déjà/);
  });

  it('accepte si seules les sorties existantes sont ANNULEE', async () => {
    sortieRepo.findByProjet.mockResolvedValue([
      { statut: StatutSortie.ANNULEE },
    ]);
    const r = await useCase.execute({
      projetId: 'p1',
      prixRevente: 100,
      dateRevente: new Date(),
    });
    expect(r).toBeDefined();
  });
});
