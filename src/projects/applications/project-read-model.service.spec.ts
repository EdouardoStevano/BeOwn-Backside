import { ProjectReadModelService } from './project-read-model.service';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import type { AgregatInvestissementsProjet } from 'src/investments/applications/ports/repositories/investment.repository';

/**
 * Deux régressions figées ici.
 *
 * 1. `GET /projects` annonçait `stats.nbInvestisseurs = 0` sur des projets
 *    intégralement souscrits (constat lot 8 sur « Résidence Les Jardins »,
 *    6 000 fractions vendues) : la valeur était câblée en dur.
 *
 * 2. N+1 (passe 4) : les compteurs venaient d'un `findByProjetId` PAR PROJET,
 *    chacun joignant le projet entier (blob `fici` ~2,4 Ko, `descriptionMd`,
 *    `previsionnel`) sur CHAQUE ligne d'investissement. Les tests comptent
 *    désormais les requêtes émises.
 */
describe('ProjectReadModelService — stats projet', () => {
  const projet = {
    id: 'p1',
    titre: 'Résidence Les Jardins',
    ticketMinimum: 500,
    capitalCible: 3_000_000,
    nbFractions: 6_000,
  };

  const ligne = (
    utilisateurId: number,
    statut: InvestmentStatus,
    montant = 500,
  ) => ({ utilisateurId, statut, montant, id: `i${utilisateurId}-${statut}` });

  type Ligne = ReturnType<typeof ligne>;

  /**
   * Faux dépôt fidèle au CONTRAT du port : une seule requête pour tous les
   * projets, filtre de statuts appliqué par la base, projets sans ligne
   * éligible absents du résultat.
   */
  function makeService(investissements: Ligne[], projetsSupplementaires = 0) {
    const parProjet = new Map<string, Ligne[]>([['p1', investissements]]);
    for (let i = 0; i < projetsSupplementaires; i += 1) {
      parProjet.set(`p${i + 2}`, investissements);
    }

    const investmentRepository = {
      countFractionsVenduesBatch: jest.fn().mockResolvedValue({ p1: 6_000 }),
      countFractionsVendues: jest.fn().mockResolvedValue(6_000),
      findByProjetId: jest.fn().mockResolvedValue(investissements),
      agregerParProjet: jest.fn(
        async (
          ids: string[],
          statuts: InvestmentStatus[],
        ): Promise<Record<string, AgregatInvestissementsProjet>> => {
          const resultat: Record<string, AgregatInvestissementsProjet> = {};
          for (const id of ids) {
            const eligibles = (parProjet.get(id) ?? []).filter((l) =>
              statuts.includes(l.statut),
            );
            if (eligibles.length === 0) continue;
            resultat[id] = {
              montantCollecte: eligibles.reduce(
                (somme, l) => somme + Number(l.montant),
                0,
              ),
              nbInvestisseurs: new Set(eligibles.map((l) => l.utilisateurId))
                .size,
            };
          }
          return resultat;
        },
      ),
    };
    const documentRepository = {
      findByProjectId: jest.fn().mockResolvedValue([]),
    };
    const avisRepository = {
      getStats: jest.fn().mockResolvedValue({ moyenne: 0, total: 0 }),
    };
    const getProjects = { executeOne: jest.fn().mockResolvedValue(projet) };
    const service = new ProjectReadModelService(
      getProjects as any,
      investmentRepository as any,
      documentRepository as any,
      avisRepository as any,
    );
    return { service, investmentRepository };
  }

  it('compte les investisseurs distincts en liste, au lieu de renvoyer 0', async () => {
    const { service } = makeService([
      ligne(1, InvestmentStatus.CONFIRME),
      ligne(2, InvestmentStatus.PAYE),
      ligne(3, InvestmentStatus.SIGNE),
    ]);

    const [enrichi] = await service.enrichFractions([{ ...projet }]);

    expect(enrichi.stats.nbInvestisseurs).toBe(3);
    expect(enrichi.fractions.vendues).toBe(6_000);
  });

  it("ne compte qu'une fois un investisseur porteur de plusieurs lignes", async () => {
    const { service } = makeService([
      ligne(7, InvestmentStatus.CONFIRME),
      ligne(7, InvestmentStatus.PAYE),
      ligne(8, InvestmentStatus.CONFIRME),
    ]);

    const [enrichi] = await service.enrichFractions([{ ...projet }]);

    expect(enrichi.stats.nbInvestisseurs).toBe(2);
  });

  it('exclut les lignes annulées ou en attente de paiement', async () => {
    const { service, investmentRepository } = makeService([
      ligne(1, InvestmentStatus.CONFIRME),
      ligne(2, InvestmentStatus.ANNULE),
      ligne(3, InvestmentStatus.PAIEMENT_ATTENDU),
    ]);

    const [enrichi] = await service.enrichFractions([{ ...projet }]);

    expect(enrichi.stats.nbInvestisseurs).toBe(1);
    expect(enrichi.stats.montantCollecte).toBe(500);
    // Le filtre est appliqué EN BASE : c'est la liste de statuts transmise au
    // dépôt qui porte la règle, pas un filtre en mémoire après coup.
    const [, statuts] = investmentRepository.agregerParProjet.mock.calls[0];
    expect(statuts).toContain(InvestmentStatus.CONFIRME);
    expect(statuts).not.toContain(InvestmentStatus.ANNULE);
    expect(statuts).not.toContain(InvestmentStatus.PAIEMENT_ATTENDU);
  });

  it('renvoie 0 quand aucune ligne active, sans échouer', async () => {
    const { service } = makeService([]);

    const [enrichi] = await service.enrichFractions([{ ...projet }]);

    expect(enrichi.stats.nbInvestisseurs).toBe(0);
    expect(enrichi.stats.montantCollecte).toBe(0);
  });

  it("liste et détail annoncent le même nombre d'investisseurs", async () => {
    const lignes = [
      ligne(1, InvestmentStatus.CONFIRME),
      ligne(1, InvestmentStatus.PAYE),
      ligne(2, InvestmentStatus.EN_DELAI_RETRACTATION),
      ligne(3, InvestmentStatus.ANNULE),
    ];
    const { service } = makeService(lignes);

    const [enrichi] = await service.enrichFractions([{ ...projet }]);
    const detail = await service.buildProjectDetail('p1', true);

    expect(enrichi.stats.nbInvestisseurs).toBe(2);
    expect(detail.stats.nbInvestisseurs).toBe(2);
    expect(enrichi.stats.montantCollecte).toBe(1_500);
    expect(detail.stats.montantCollecte).toBe(1_500);
  });

  it('ne requête rien sur une liste vide', async () => {
    const { service, investmentRepository } = makeService([]);

    await expect(service.enrichFractions([])).resolves.toEqual([]);
    expect(investmentRepository.agregerParProjet).not.toHaveBeenCalled();
    expect(
      investmentRepository.countFractionsVenduesBatch,
    ).not.toHaveBeenCalled();
  });

  describe('nombre de requêtes émises (N+1)', () => {
    it('une SEULE requête d’agrégat pour 20 projets, pas 20', async () => {
      const { service, investmentRepository } = makeService(
        [ligne(1, InvestmentStatus.CONFIRME)],
        19,
      );
      const projets = Array.from({ length: 20 }, (_, i) => ({
        ...projet,
        id: `p${i + 1}`,
      }));

      const enrichis = await service.enrichFractions(projets);

      expect(enrichis).toHaveLength(20);
      expect(investmentRepository.agregerParProjet).toHaveBeenCalledTimes(1);
      expect(investmentRepository.agregerParProjet).toHaveBeenCalledWith(
        projets.map((p) => p.id),
        expect.arrayContaining([InvestmentStatus.CONFIRME]),
      );
      // La requête « par projet », qui joignait le projet entier sur chaque
      // ligne d'investissement, n'est plus émise du tout.
      expect(investmentRepository.findByProjetId).not.toHaveBeenCalled();
    });

    it('chaque projet de la liste reçoit bien SES agrégats', async () => {
      const { service } = makeService([ligne(1, InvestmentStatus.CONFIRME)], 2);
      const projets = ['p1', 'p2', 'p3', 'p4'].map((id) => ({
        ...projet,
        id,
      }));

      const enrichis = await service.enrichFractions(projets);

      // p1..p3 existent dans le faux dépôt, p4 n'a aucune ligne éligible.
      expect(enrichis.map((p) => p.stats.nbInvestisseurs)).toEqual([1, 1, 1, 0]);
      expect(enrichis.map((p) => p.stats.montantCollecte)).toEqual([
        500, 500, 500, 0,
      ]);
    });

    it('le détail n’émet plus la requête « toutes les lignes du projet »', async () => {
      const { service, investmentRepository } = makeService([
        ligne(1, InvestmentStatus.CONFIRME),
      ]);

      await service.buildProjectDetail('p1', true);

      expect(investmentRepository.findByProjetId).not.toHaveBeenCalled();
      expect(investmentRepository.agregerParProjet).toHaveBeenCalledWith(
        ['p1'],
        expect.any(Array),
      );
    });
  });
});
