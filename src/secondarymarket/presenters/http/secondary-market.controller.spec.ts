import { BadRequestException, GoneException } from '@nestjs/common';
import { SecondaryMarketController } from './secondary-market.controller';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import {
  CODE_DETENTION_TROP_RECENTE,
  CODE_PROJET_NON_ELIGIBLE,
} from 'src/secondarymarket/domains/tableau-affichage';

/**
 * Trois points sensibles du basculement « tableau d'affichage » :
 *
 * 1. `POST orders/:id/execute` est DÉBRANCHÉE : 410 + code stable, et surtout
 *    AUCUNE lecture ni écriture — l'ancienne route transférait des fractions
 *    sans accord du vendeur.
 * 2. `GET orders/mine/interets` est anti-IDOR par construction : le filtre
 *    `vendeurId = demandeur` est posé dans la requête, et l'identité de
 *    l'acheteur est réduite au strict nécessaire.
 * 3. La création d'annonce applique l'éligibilité côté serveur (détention
 *    minimale, projet en exploitation) avec des codes métier distincts.
 */

/** Query builder factice, chaînable, qui journalise les filtres appliqués. */
const fakeQueryBuilder = (rows: any[]) => {
  const calls: Record<string, any[]> = { where: [], andWhere: [] };
  const qb: any = {
    calls,
    leftJoinAndMapOne: jest.fn(() => qb),
    where: jest.fn((...args: any[]) => {
      calls.where.push(args);
      return qb;
    }),
    andWhere: jest.fn((...args: any[]) => {
      calls.andWhere.push(args);
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
};

const noopMetrics = {
  incrementCounter: jest.fn(),
  observeHistogram: jest.fn(),
  setGauge: jest.fn(),
};

const devisFactice = {
  montantBrut: 300,
  plusValueVendeur: 60,
  fraisTransaction: 3,
  fraisPlusValue: 9,
  totalFrais: 12,
  netVendeur: 288,
  aLaChargeDe: 'vendeur' as const,
  tauxTransactionPct: 1,
  tauxPlusValuePct: 15,
};

const buildController = (overrides: Partial<Record<string, any>> = {}) => {
  const deps = {
    ordreRepo: { createQueryBuilder: jest.fn(), findOne: jest.fn(), save: jest.fn() },
    investRepo: { findOne: jest.fn() },
    projectRepo: { findOne: jest.fn() },
    userRepo: { findOne: jest.fn() },
    dataSource: { transaction: jest.fn() },
    notificationService: { push: jest.fn() },
    notificationEvents: { secondaryOrderCreated: jest.fn() },
    initiateBuyUseCase: { execute: jest.fn() },
    exprimerInteretUseCase: { execute: jest.fn() },
    repondreInteretUseCase: { accepter: jest.fn(), refuser: jest.fn() },
    cancelInitiationUseCase: { execute: jest.fn() },
    signatureRepo: { find: jest.fn(), findOne: jest.fn() },
    metrics: { ...noopMetrics },
    devisCession: {
      chargerTaux: jest.fn().mockResolvedValue({}),
      calculer: jest.fn().mockResolvedValue(devisFactice),
    },
    ...overrides,
  };

  const controller = new SecondaryMarketController(
    deps.ordreRepo as any,
    deps.investRepo as any,
    deps.projectRepo as any,
    deps.userRepo as any,
    deps.dataSource as any,
    deps.notificationService as any,
    deps.notificationEvents as any,
    deps.initiateBuyUseCase as any,
    deps.exprimerInteretUseCase as any,
    deps.repondreInteretUseCase as any,
    deps.cancelInitiationUseCase as any,
    deps.signatureRepo as any,
    deps.metrics as any,
    deps.devisCession as any,
  );

  return { controller, deps };
};

const vendeur = { userId: 1, email: 'vendeur@beown.fr', role: 'investisseur' };
const autreVendeur = { userId: 99, email: 'autre@beown.fr', role: 'investisseur' };

describe('POST orders/:id/execute — débranchée', () => {
  it('répond 410 Gone avec le code métier SECONDARY_EXECUTE_DISABLED', () => {
    const { controller } = buildController();

    let caught: any;
    try {
      controller.executeOrder();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(GoneException);
    expect(caught.getStatus()).toBe(410);
    expect(caught.getResponse()).toMatchObject({
      code: 'SECONDARY_EXECUTE_DISABLED',
    });
    expect(String((caught.getResponse() as any).message)).toContain('vendeur');
  });

  it("n'effectue AUCUNE lecture ni écriture : ni transaction, ni repo, ni notification", () => {
    const { controller, deps } = buildController();

    expect(() => controller.executeOrder()).toThrow(GoneException);

    // Aucune écriture (wallet, investissement, ordre) : la transaction — seul
    // chemin d'écriture de l'ancienne implémentation — n'est jamais ouverte.
    expect(deps.dataSource.transaction).not.toHaveBeenCalled();
    // Aucune lecture non plus : l'existence de l'ordre elle-même n'est plus
    // révélée par cette route.
    expect(deps.ordreRepo.findOne).not.toHaveBeenCalled();
    expect(deps.ordreRepo.save).not.toHaveBeenCalled();
    expect(deps.investRepo.findOne).not.toHaveBeenCalled();
    expect(deps.notificationEvents.secondaryOrderCreated).not.toHaveBeenCalled();
    expect(deps.notificationService.push).not.toHaveBeenCalled();
  });

  it("compte l'appel au mécanisme retiré (reason bornée)", () => {
    const { controller, deps } = buildController();
    expect(() => controller.executeOrder()).toThrow(GoneException);
    expect(deps.metrics.incrementCounter).toHaveBeenCalledWith(
      expect.any(String),
      { reason: 'execute_disabled' },
    );
  });
});

describe('GET orders/mine/interets — anti-IDOR par construction', () => {
  const ordreAvecInteret = {
    id: 'ordre-1',
    statut: OrdreMarcheStatus.INTERET_EXPRIME,
    vendeurId: 1,
    nbFractions: 10,
    prixUnitaire: '100.00',
    interetNbFractions: 3,
    interetExprimeLe: new Date('2026-08-01T10:00:00Z'),
    createdAt: new Date('2026-07-01T10:00:00Z'),
    investissement: {
      valeurTitre: '80.00',
      nbTitres: 100,
      montant: '8000.00',
      projet: {
        id: 'proj-1',
        slug: 'residence-les-jardins',
        titre: 'Résidence Les Jardins',
        ville: 'Lyon',
        statut: 'en_exploitation',
      },
    },
    acheteur: {
      userId: 42,
      firstname: 'Camille',
      lastname: 'Durand',
      email: 'camille@exemple.fr',
    },
  };

  it('filtre les intérêts sur les annonces DU DEMANDEUR, dans la requête elle-même', async () => {
    const qb = fakeQueryBuilder([]);
    const { controller } = buildController({
      ordreRepo: { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn(), save: jest.fn() },
    });

    await controller.myReceivedInterests(vendeur as any);

    expect(qb.calls.where).toContainEqual([
      'ord.vendeurId = :vendeurId',
      { vendeurId: 1 },
    ]);
    expect(qb.calls.andWhere).toContainEqual([
      'ord.statut = :statut',
      { statut: OrdreMarcheStatus.INTERET_EXPRIME },
    ]);
  });

  it('deux demandeurs différents produisent deux filtres différents — jamais de paramètre client', async () => {
    const qb1 = fakeQueryBuilder([]);
    const qb2 = fakeQueryBuilder([]);
    const builders = [qb1, qb2];
    const { controller } = buildController({
      ordreRepo: {
        createQueryBuilder: jest.fn(() => builders.shift()),
        findOne: jest.fn(),
        save: jest.fn(),
      },
    });

    await controller.myReceivedInterests(vendeur as any);
    await controller.myReceivedInterests(autreVendeur as any);

    expect(qb1.calls.where).toContainEqual([
      'ord.vendeurId = :vendeurId',
      { vendeurId: 1 },
    ]);
    expect(qb2.calls.where).toContainEqual([
      'ord.vendeurId = :vendeurId',
      { vendeurId: 99 },
    ]);
  });

  it("réduit l'identité de l'acheteur au prénom et à l'initiale — ni email, ni nom complet, ni identifiant", async () => {
    const qb = fakeQueryBuilder([ordreAvecInteret]);
    const { controller } = buildController({
      ordreRepo: { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn(), save: jest.fn() },
    });

    const interets = await controller.myReceivedInterests(vendeur as any);

    expect(interets).toHaveLength(1);
    expect(interets[0].acheteur).toEqual({ prenom: 'Camille', initialeNom: 'D.' });
    const serialise = JSON.stringify(interets);
    expect(serialise).not.toContain('camille@exemple.fr');
    expect(serialise).not.toContain('Durand');
    expect(serialise).not.toContain('"userId":42');
  });

  it("expose l'annonce, la quantité, le montant indicatif et le devis de frais", async () => {
    const qb = fakeQueryBuilder([ordreAvecInteret]);
    const { controller, deps } = buildController({
      ordreRepo: { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn(), save: jest.fn() },
    });

    const [interet] = await controller.myReceivedInterests(vendeur as any);

    expect(interet).toMatchObject({
      ordreId: 'ordre-1',
      statut: OrdreMarcheStatus.INTERET_EXPRIME,
      nbFractions: 3,
      nbFractionsAnnonce: 10,
      prixUnitaire: 100,
      montantIndicatif: 300,
      exprimeLe: '2026-08-01T10:00:00.000Z',
      projet: expect.objectContaining({ slug: 'residence-les-jardins' }),
      devis: devisFactice,
    });
    // Le devis est calculé sur l'assiette réelle du vendeur (prix de revient
    // = valeurTitre de son investissement), avec le snapshot de taux.
    expect(deps.devisCession.calculer).toHaveBeenCalledWith(
      { nbFractions: 3, prixUnitaire: 100, prixRevientUnitaire: 80 },
      expect.anything(),
    );
    // La grille de frais n'est lue qu'une fois pour toute la liste.
    expect(deps.devisCession.chargerTaux).toHaveBeenCalledTimes(1);
  });
});

describe('GET orders — devis de frais attaché à chaque annonce', () => {
  it('chaque annonce publiée porte fraisTransaction et fraisPlusValue', async () => {
    const ordres = [
      {
        id: 'o-1',
        nbFractions: 10,
        prixUnitaire: '100.00',
        investissement: { valeurTitre: '80.00', nbTitres: 100, montant: '8000.00' },
      },
      {
        id: 'o-2',
        nbFractions: 5,
        prixUnitaire: '90.00',
        investissement: { valeurTitre: '100.00', nbTitres: 50, montant: '5000.00' },
      },
    ];
    const qb = fakeQueryBuilder(ordres);
    const { controller, deps } = buildController({
      ordreRepo: { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn(), save: jest.fn() },
    });

    const result = await controller.listOrders();

    expect(result).toHaveLength(2);
    for (const ordre of result as any[]) {
      expect(ordre.devis).toMatchObject({
        fraisTransaction: expect.any(Number),
        fraisPlusValue: expect.any(Number),
      });
    }
    expect(deps.devisCession.chargerTaux).toHaveBeenCalledTimes(1);
    expect(deps.devisCession.calculer).toHaveBeenCalledTimes(2);
  });
});

describe('POST orders — éligibilité appliquée côté serveur', () => {
  /**
   * EntityManager factice pour le callback transactionnel : lock de
   * l'investissement, lecture du projet, comptage des annonces actives.
   */
  const fakeEm = (investment: any, projet: any) => {
    const em: any = {
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(investment),
      })),
      findOne: jest.fn().mockResolvedValue(projet),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_entity: any, data: any) => data),
      save: jest.fn((_entity: any, data: any) => Promise.resolve({ id: 'ordre-neuf', ...data })),
    };
    return em;
  };

  const dtoVente = {
    investissementId: 'inv-1',
    sens: 'vente',
    nbFractions: 5,
    prixUnitaire: 100,
    montant: 500,
  };

  const controllerAvecTransaction = (em: any) => {
    const { controller, deps } = buildController({
      dataSource: {
        transaction: jest.fn((cb: (em: any) => Promise<any>) => cb(em)),
      },
      investRepo: { findOne: jest.fn().mockResolvedValue(null) },
      userRepo: { findOne: jest.fn().mockResolvedValue(null) },
    });
    return { controller, deps, em };
  };

  const ilYA = (mois: number): Date => {
    const d = new Date();
    d.setMonth(d.getMonth() - mois);
    return d;
  };

  it('refuse une détention < 6 mois : 400 SECONDARY_HOLDING_TOO_RECENT, rien écrit', async () => {
    const em = fakeEm(
      { id: 'inv-1', utilisateurId: 1, projetId: 'proj-1', nbTitres: 100, createdAt: ilYA(2) },
      { id: 'proj-1', statut: 'en_exploitation' },
    );
    const { controller } = controllerAvecTransaction(em);

    let caught: any;
    try {
      await controller.createOrder(dtoVente as any, vendeur as any);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    expect(caught.getResponse()).toMatchObject({
      code: CODE_DETENTION_TROP_RECENTE,
      cessibleAPartirDu: expect.any(String),
    });
    expect(em.save).not.toHaveBeenCalled();
  });

  it("refuse un projet hors exploitation : 400 SECONDARY_PROJECT_NOT_ELIGIBLE, rien écrit", async () => {
    const em = fakeEm(
      { id: 'inv-1', utilisateurId: 1, projetId: 'proj-1', nbTitres: 100, createdAt: ilYA(12) },
      { id: 'proj-1', statut: 'en_collecte' },
    );
    const { controller } = controllerAvecTransaction(em);

    let caught: any;
    try {
      await controller.createOrder(dtoVente as any, vendeur as any);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    expect(caught.getResponse()).toMatchObject({ code: CODE_PROJET_NON_ELIGIBLE });
    expect(em.save).not.toHaveBeenCalled();
  });

  it('accepte détention ≥ 6 mois + projet en exploitation : annonce créée', async () => {
    const em = fakeEm(
      { id: 'inv-1', utilisateurId: 1, projetId: 'proj-1', nbTitres: 100, createdAt: ilYA(7) },
      { id: 'proj-1', statut: 'en_exploitation' },
    );
    const { controller } = controllerAvecTransaction(em);

    const saved = await controller.createOrder(dtoVente as any, vendeur as any);

    expect(em.save).toHaveBeenCalledTimes(1);
    expect(saved).toMatchObject({
      id: 'ordre-neuf',
      vendeurId: 1,
      nbFractions: 5,
      statut: OrdreMarcheStatus.EN_CARNET,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Durée de validité et double-listing.
//
// Deux trous que l'interface ne pouvait pas montrer : une annonce périmée
// restait publiée et sollicitable, et les fractions d'une annonce déjà
// sollicitée ou acceptée redevenaient « disponibles » — le vendeur pouvait
// promettre deux fois les mêmes parts.
// ═══════════════════════════════════════════════════════════════════════════

describe('GET orders — les annonces échues ne sont pas publiées', () => {
  it('filtre sur la date de validité, sans exclure les annonces sans échéance', async () => {
    const qb = fakeQueryBuilder([]);
    const { controller } = buildController({
      ordreRepo: { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn(), save: jest.fn() },
    });

    await controller.listOrders();

    const clause = qb.calls.andWhere.find(([sql]: any[]) =>
      String(sql).includes('valideJusquAu'),
    );
    expect(clause).toBeDefined();
    // Une annonce sans date de validité ne périme jamais : elle reste servie.
    expect(String(clause[0])).toContain('IS NULL');
    expect(clause[1].jourLimite).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('POST orders — les fractions déjà engagées ne sont plus disponibles', () => {
  const emAvecAnnonces = (investment: any, projet: any, annonces: any[]) => {
    const capture: { where?: any } = {};
    const em: any = {
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(investment),
      })),
      findOne: jest.fn().mockResolvedValue(projet),
      find: jest.fn((_entity: any, options: any) => {
        capture.where = options.where;
        return Promise.resolve(annonces);
      }),
      create: jest.fn((_entity: any, data: any) => data),
      save: jest.fn((_entity: any, data: any) =>
        Promise.resolve({ id: 'ordre-neuf', ...data }),
      ),
    };
    return { em, capture };
  };

  const investissementCessible = {
    id: 'inv-1',
    utilisateurId: 1,
    projetId: 'proj-1',
    nbTitres: 10,
    createdAt: new Date(new Date().setFullYear(new Date().getFullYear() - 2)),
  };
  const projetEnExploitation = { id: 'proj-1', statut: 'en_exploitation' };

  const controllerAvec = (em: any) =>
    buildController({
      dataSource: { transaction: jest.fn((cb: (em: any) => Promise<any>) => cb(em)) },
      investRepo: { findOne: jest.fn().mockResolvedValue(null) },
      userRepo: { findOne: jest.fn().mockResolvedValue(null) },
    }).controller;

  it("compte les annonces EN_CARNET, INTERET_EXPRIME et ACCEPTE comme engageantes", async () => {
    const { em, capture } = emAvecAnnonces(
      investissementCessible,
      projetEnExploitation,
      [],
    );
    const controller = controllerAvec(em);

    await controller.createOrder(
      { investissementId: 'inv-1', sens: 'vente', nbFractions: 1, prixUnitaire: 100, montant: 100 } as any,
      vendeur as any,
    );

    const statuts = capture.where?.statut?._value ?? capture.where?.statut;
    expect(statuts).toEqual(
      expect.arrayContaining([
        OrdreMarcheStatus.EN_CARNET,
        OrdreMarcheStatus.INTERET_EXPRIME,
        OrdreMarcheStatus.ACCEPTE,
      ]),
    );
    // Un ordre EXECUTE, ANNULE ou EXPIRE n'immobilise plus rien.
    expect(statuts).not.toContain(OrdreMarcheStatus.EXECUTE);
    expect(statuts).not.toContain(OrdreMarcheStatus.ANNULE);
  });

  it("refuse de republier des fractions déjà sollicitées par un acheteur", async () => {
    // 10 fractions détenues, 8 déjà portées par une annonce INTERET_EXPRIME :
    // il n'en reste que 2 à annoncer.
    const { em } = emAvecAnnonces(investissementCessible, projetEnExploitation, [
      { nbFractions: 8, statut: OrdreMarcheStatus.INTERET_EXPRIME },
    ]);
    const controller = controllerAvec(em);

    let caught: any;
    try {
      await controller.createOrder(
        { investissementId: 'inv-1', sens: 'vente', nbFractions: 5, prixUnitaire: 100, montant: 500 } as any,
        vendeur as any,
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    expect(String(caught.message)).toContain('2 fraction');
    expect(em.save).not.toHaveBeenCalled();
  });
});
