import { DeclareSortieUseCase } from './declare-sortie.usecase';
import {
  STATUTS_PROJET_CESSIBLES,
  StatutSortie,
} from '../../domains/sortie-projet';
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

  describe('statuts de projet autorisés à la cession', () => {
    const declarer = () =>
      useCase.execute({
        projetId: 'p1',
        prixRevente: 260_000_000,
        dateRevente: new Date('2031-05-15'),
      });

    const avecStatut = (statut: ProjectStatus) =>
      projectRepo.findProjectById.mockResolvedValue({
        id: 'p1',
        modeleEconomique: ModeleEconomique.EQUITY,
        statut,
        capitalCible: 200_000_000,
      });

    // Le bien existe et appartient à la société support : la cession a un sens.
    it.each([ProjectStatus.FINANCE, ProjectStatus.EN_EXPLOITATION])(
      'accepte un projet en %s',
      async (statut) => {
        avecStatut(statut);
        await expect(declarer()).resolves.toMatchObject({
          statut: StatutSortie.PROJETEE,
          plusValueBrute: 60_000_000,
        });
      },
    );

    // Avant FINANCE il n'y a rien à céder ; après, la sortie est déjà faite ou
    // l'opération est fermée sans acquisition.
    it.each([
      ProjectStatus.BROUILLON,
      ProjectStatus.ANNONCE,
      ProjectStatus.PRE_INVESTISSEMENT,
      ProjectStatus.EN_COLLECTE,
      ProjectStatus.CLOTURE,
      ProjectStatus.ECHEC,
      ProjectStatus.ANNULE,
    ])(
      'refuse un projet en %s, avec le statut dans le message',
      async (statut) => {
        avecStatut(statut);
        await expect(declarer()).rejects.toThrow(
          `Une cession ne peut être déclarée que sur un projet financé ou en exploitation (statut actuel : ${statut}).`,
        );
        expect(sortieRepo.save).not.toHaveBeenCalled();
      },
    );

    it("n'accepte que deux statuts sur les neuf de l'énumération", () => {
      expect(STATUTS_PROJET_CESSIBLES).toEqual([
        ProjectStatus.FINANCE,
        ProjectStatus.EN_EXPLOITATION,
      ]);
      expect(Object.values(ProjectStatus)).toHaveLength(9);
    });
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
    sortieRepo.findByProjet.mockResolvedValue([{ statut: StatutSortie.ACTEE }]);
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
