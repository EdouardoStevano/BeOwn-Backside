import { ProjectReadModelService } from './project-read-model.service';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

/**
 * Régression : `GET /projects` annonçait `stats.nbInvestisseurs = 0` sur des
 * projets intégralement souscrits (constat lot 8 sur « Résidence Les Jardins »,
 * 6 000 fractions vendues). La valeur était câblée en dur dans
 * `enrichFractions`, alors que le détail projet, lui, la calculait.
 */
describe('ProjectReadModelService — stats.nbInvestisseurs', () => {
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

  function makeService(investissements: any[]) {
    const investmentRepository = {
      countFractionsVenduesBatch: jest.fn().mockResolvedValue({ p1: 6_000 }),
      countFractionsVendues: jest.fn().mockResolvedValue(6_000),
      findByProjetId: jest.fn().mockResolvedValue(investissements),
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
    const { service } = makeService([
      ligne(1, InvestmentStatus.CONFIRME),
      ligne(2, InvestmentStatus.ANNULE),
      ligne(3, InvestmentStatus.PAIEMENT_ATTENDU),
    ]);

    const [enrichi] = await service.enrichFractions([{ ...projet }]);

    expect(enrichi.stats.nbInvestisseurs).toBe(1);
  });

  it('renvoie 0 quand aucune ligne active, sans échouer', async () => {
    const { service } = makeService([]);

    const [enrichi] = await service.enrichFractions([{ ...projet }]);

    expect(enrichi.stats.nbInvestisseurs).toBe(0);
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
  });

  it('ne requête rien sur une liste vide', async () => {
    const { service, investmentRepository } = makeService([]);

    await expect(service.enrichFractions([])).resolves.toEqual([]);
    expect(investmentRepository.findByProjetId).not.toHaveBeenCalled();
    expect(
      investmentRepository.countFractionsVenduesBatch,
    ).not.toHaveBeenCalled();
  });
});
