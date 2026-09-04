import { BadRequestException } from '@nestjs/common';
import { CreateInvestmentUseCase } from './create-investment.usecase';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { TransactionType } from 'src/wallets/domains/enums/wallet.enum';
import { CategorieInvestisseur } from 'src/profiles/domains/investor-classification';
import {
  mouvementsDepuisInstantanes,
  variationTotale,
  PositionWallet,
} from 'src/wallets/domains/grand-livre';

/**
 * Vérifie l'atomicité de la création d'investissement (correctif de survente /
 * double-dépense). Les repos sont mockés ; le cœur monétaire vit dans
 * dataSource.transaction dont le mock invoque le callback avec un EntityManager
 * simulé (verrous pessimistes sur projet + wallet, recompte des fractions sous
 * verrou, débit sous verrou). On prouve : chemin heureux (débit unique +
 * création), solde insuffisant relu SOUS VERROU → throw sans persistance,
 * survente recomptée SOUS VERROU → throw sans persistance, et que les écritures
 * sont bien enveloppées dans la transaction avec verrous.
 */
describe('CreateInvestmentUseCase — atomicité', () => {
  let useCase: CreateInvestmentUseCase;
  let investmentRepository: any;
  let projectRepository: any;
  let walletRepository: any;
  let documentRepository: any;
  let userRepository: any;
  let profilRepository: any;
  let contractGenerator: any;
  let cloudStorage: any;
  let notificationService: any;
  let notificationEvents: any;
  let dataSource: any;
  let manager: any;

  // État relu SOUS VERROU dans la transaction (configurable par test).
  let projectRow: any;
  let walletRow: any;
  let projectWalletRow: any; // wallet technique du projet (grand livre)
  let projectWalletResolver: any;
  let lockedSoldTotal: number; // fractions vendues recomptées sous verrou

  const USER_ID = 42;
  const dto: any = { projetId: 'p1', nbFractions: 2 };

  const baseProject = () => ({
    id: 'p1',
    titre: 'Projet Test',
    ville: 'Paris',
    pays: 'FR',
    instrument: 'OBLIGATION',
    statut: ProjectStatus.EN_COLLECTE,
    capitalCible: 10000,
    ticketMinimum: 100,
    ticketMaximum: null,
    nbFractions: 100,
    triCible: 8,
    dureeMois: 12,
  });

  beforeEach(() => {
    projectRow = { id: 'p1', statut: ProjectStatus.EN_COLLECTE };
    walletRow = { id: 'w1', solde: 1000, soldeBloque: 0, devise: 'EUR' };
    projectWalletRow = { id: 'wp1', solde: 0, soldeBloque: 0, devise: 'EUR' };
    lockedSoldTotal = 0;

    // Résolution idempotente du wallet technique du projet : renvoie toujours
    // la même ligne (créée à la demande dans le vrai use case).
    projectWalletResolver = {
      executeInTransaction: jest.fn().mockImplementation(async () => projectWalletRow),
      findInTransaction: jest.fn().mockImplementation(async () => projectWalletRow),
    };

    investmentRepository = {
      findInvestmentById: jest.fn().mockResolvedValue(null),
      countFractionsVendues: jest.fn().mockResolvedValue(0),
      updateBulletinDocId: jest.fn().mockResolvedValue(undefined),
    };
    projectRepository = {
      findProjectById: jest.fn().mockResolvedValue(baseProject()),
    };
    walletRepository = {
      findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findWalletByUser: jest
        .fn()
        .mockResolvedValue({ id: 'w1', solde: 1000, devise: 'EUR' }),
    };
    documentRepository = { save: jest.fn().mockResolvedValue({ id: 'd1' }) };
    userRepository = {
      findById: jest.fn().mockResolvedValue({
        userId: USER_ID,
        firstname: 'Jean',
        lastname: 'Test',
        userEmail: { email: 'jean@example.com' },
      }),
    };
    profilRepository = {
      findProfilPPByUserId: jest.fn().mockResolvedValue(null),
    };
    contractGenerator = {
      generateBulletin: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    cloudStorage = {
      upload: jest
        .fn()
        .mockResolvedValue({ objectName: 'o', publicUrl: 'u' }),
    };
    notificationService = { push: jest.fn(), pushToAdmins: jest.fn() };
    notificationEvents = { investmentCreated: jest.fn() };

    manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === ProjectEntity) return projectRow;
        if (entity === WalletEntity) return walletRow;
        return null;
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest
          .fn()
          .mockResolvedValue({ total: String(lockedSoldTotal) }),
      })),
      save: jest.fn(async (entity: any, obj: any) => {
        if (entity === InvestmentEntity) return { ...obj, id: 'inv-1' };
        return obj;
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      // Aucune souscription sous délai de réflexion par défaut : la bascule
      // FINANCE reste possible (art. 22 — cf. create-investment.usecase.ts).
      count: jest.fn().mockResolvedValue(0),
    };
    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };

    useCase = new CreateInvestmentUseCase(
      investmentRepository,
      projectRepository,
      walletRepository,
      documentRepository,
      userRepository,
      profilRepository,
      contractGenerator,
      cloudStorage,
      notificationService,
      notificationEvents,
      dataSource,
      {
        incrementCounter: jest.fn(),
        observeHistogram: jest.fn(),
        setGauge: jest.fn(),
      } as any,
      projectWalletResolver,
      { check: jest.fn().mockResolvedValue(undefined) } as any,
      { surInvestissementDefinitif: jest.fn().mockResolvedValue(undefined) } as any,
      /* gelDesAvoirs */ { assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined) } as any,
      /* conflitsInterets */ { assertPasPorteurDuProjet: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  const savedInvestments = () =>
    manager.save.mock.calls.filter((c: any) => c[0] === InvestmentEntity);
  const walletSaves = () =>
    manager.save.mock.calls.filter((c: any) => c[0] === WalletEntity);

  it('chemin heureux : débite exactement une fois et crée l’investissement dans la transaction', async () => {
    const result = await useCase.execute(USER_ID, dto);

    // La section critique est enveloppée dans UNE transaction.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    // Verrous pessimistes demandés sur projet ET wallet.
    const projLock = manager.findOne.mock.calls.find(
      (c: any) => c[0] === ProjectEntity,
    );
    const walletLock = manager.findOne.mock.calls.find(
      (c: any) => c[0] === WalletEntity,
    );
    expect(projLock[1].lock).toEqual({ mode: 'pessimistic_write' });
    expect(walletLock[1].lock).toEqual({ mode: 'pessimistic_write' });

    // L'investissement est persisté exactement une fois via le manager.
    expect(savedInvestments()).toHaveLength(1);

    // Débit unique : solde relu (1000) − montant (2 × 100) = 800.
    expect(walletSaves()).toHaveLength(1);
    expect(walletSaves()[0][1].solde).toBe(800);

    // La transaction ledger est écrite dans la même transaction.
    const txSaves = manager.save.mock.calls.filter(
      (c: any) => c[0] === TransactionEntity,
    );
    expect(txSaves).toHaveLength(1);
    expect(txSaves[0][1].montant).toBe(200);

    expect(result.id).toBe('inv-1');
  });

  it('solde insuffisant relu SOUS VERROU → throw, rien n’est persisté', async () => {
    // Pré-check passant (findWalletByUser = 1000) mais le solde verrouillé est
    // insuffisant → seul le contrôle sous verrou tranche.
    walletRow = { id: 'w1', solde: 50, devise: 'EUR' };

    await expect(useCase.execute(USER_ID, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(savedInvestments()).toHaveLength(0);
    expect(walletSaves()).toHaveLength(0);
  });

  it('survente recomptée SOUS VERROU (nbFractions > disponibles) → throw, rien n’est persisté', async () => {
    // Pré-check passant (countFractionsVendues = 0) mais 99 fractions déjà
    // vendues d'après le recompte verrouillé → 1 dispo < 2 demandées.
    lockedSoldTotal = 99;
    manager.createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '99' }),
    }));

    await expect(useCase.execute(USER_ID, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(savedInvestments()).toHaveLength(0);
    expect(walletSaves()).toHaveLength(0);
  });

  it('projet entièrement vendu → passage FINANCE sous le verrou projet', async () => {
    // 98 déjà vendues + 2 demandées = 100 = total → FINANCE.
    manager.createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '98' }),
    }));

    await useCase.execute(USER_ID, dto);

    const projectSave = manager.save.mock.calls.find(
      (c: any) => c[0] === ProjectEntity,
    );
    expect(projectSave).toBeDefined();
    expect(projectSave[1].statut).toBe(ProjectStatus.FINANCE);
  });

  it('retry idempotent : une requête déjà traitée renvoie l’investissement sans entrer dans la transaction', async () => {
    const idemDto = { ...dto, idempotencyKey: 'abc' };
    walletRepository.findTransactionByIdempotencyKey.mockResolvedValue({
      investissementId: 'inv-existing',
    });
    investmentRepository.findInvestmentById.mockResolvedValue({
      id: 'inv-existing',
    });

    const result = await useCase.execute(USER_ID, idemDto);
    expect(result.id).toBe('inv-existing');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});

/**
 * GRAND LIVRE — la souscription est une opération interne : elle DÉPLACE des
 * fonds sans en créer ni en détruire. Preuve par instantanés avant/après sur
 * l'ensemble des wallets : la somme des variations (disponible + bloqué) vaut
 * exactement zéro, pour l'investisseur averti (crédit du wallet projet) comme
 * pour le non averti (blocage interne, art. 22).
 */
describe('CreateInvestmentUseCase — invariant comptable (scénario : souscription simple)', () => {
  let harnais: ReturnType<typeof buildHarnais>;

  const USER_ID = 42;
  const dto: any = { projetId: 'p1', nbFractions: 2 };

  const profilAverti = {
    categoriePsfp: CategorieInvestisseur.AVERTI,
    // Évaluation valide : expire dans un an.
    evaluationExpireLe: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    patrimoineNetCalcule: 100000,
    seuilAvertissementCalcule: 5000,
  };

  function buildHarnais() {
    const projectRow: any = { id: 'p1', statut: ProjectStatus.EN_COLLECTE };
    const walletRow: any = { id: 'w1', solde: 1000, soldeBloque: 0, devise: 'EUR' };
    const projectWalletRow: any = { id: 'wp1', solde: 0, soldeBloque: 0, devise: 'EUR' };

    const snapshot = (): Map<string, PositionWallet> =>
      new Map(
        [walletRow, projectWalletRow].map((w: any) => [
          w.id,
          { solde: Number(w.solde), soldeBloque: Number(w.soldeBloque ?? 0) },
        ]),
      );

    const manager: any = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === ProjectEntity) return projectRow;
        if (entity === WalletEntity) return walletRow;
        return null;
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
      })),
      save: jest.fn(async (entity: any, obj: any) => {
        if (entity === InvestmentEntity) return { ...obj, id: 'inv-1' };
        return obj;
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
    };

    const profilRepository = {
      findProfilPPByUserId: jest.fn().mockResolvedValue(null),
    };
    const projectWalletResolver = {
      executeInTransaction: jest.fn(async () => projectWalletRow),
      findInTransaction: jest.fn(async () => projectWalletRow),
    };
    const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(manager)) };

    const useCase = new CreateInvestmentUseCase(
      {
        findInvestmentById: jest.fn().mockResolvedValue(null),
        countFractionsVendues: jest.fn().mockResolvedValue(0),
        updateBulletinDocId: jest.fn().mockResolvedValue(undefined),
      } as any,
      {
        findProjectById: jest.fn().mockResolvedValue({
          id: 'p1',
          titre: 'Projet Test',
          ville: 'Paris',
          pays: 'FR',
          instrument: 'OBLIGATION',
          statut: ProjectStatus.EN_COLLECTE,
          capitalCible: 10000,
          ticketMinimum: 100,
          ticketMaximum: null,
          nbFractions: 100,
          triCible: 8,
          dureeMois: 12,
        }),
      } as any,
      {
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        findWalletByUser: jest
          .fn()
          .mockResolvedValue({ id: 'w1', solde: 1000, devise: 'EUR' }),
      } as any,
      { save: jest.fn().mockResolvedValue({ id: 'd1' }) } as any,
      {
        findById: jest.fn().mockResolvedValue({
          userId: USER_ID,
          firstname: 'Jean',
          lastname: 'Test',
          userEmail: { email: 'jean@example.com' },
        }),
      } as any,
      profilRepository as any,
      { generateBulletin: jest.fn().mockResolvedValue(Buffer.from('pdf')) } as any,
      {
        upload: jest.fn().mockResolvedValue({ objectName: 'o', publicUrl: 'u' }),
      } as any,
      { push: jest.fn(), pushToAdmins: jest.fn() } as any,
      { investmentCreated: jest.fn() } as any,
      dataSource,
      {
        incrementCounter: jest.fn(),
        observeHistogram: jest.fn(),
        setGauge: jest.fn(),
      } as any,
      projectWalletResolver as any,
      { check: jest.fn().mockResolvedValue(undefined) } as any,
      { surInvestissementDefinitif: jest.fn().mockResolvedValue(undefined) } as any,
      /* gelDesAvoirs */ { assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined) } as any,
      /* conflitsInterets */ { assertPasPorteurDuProjet: jest.fn().mockResolvedValue(undefined) } as any,
    );

    return {
      useCase,
      manager,
      profilRepository,
      projectWalletResolver,
      walletRow,
      projectWalletRow,
      snapshot,
    };
  }

  beforeEach(() => {
    harnais = buildHarnais();
  });

  const txSaves = () =>
    harnais.manager.save.mock.calls.filter((c: any) => c[0] === TransactionEntity);

  it('investisseur averti : Σ des variations de solde de TOUS les wallets = 0, débit investisseur = crédit projet', async () => {
    harnais.profilRepository.findProfilPPByUserId.mockResolvedValue(profilAverti);
    const avant = harnais.snapshot();

    await harnais.useCase.execute(USER_ID, dto);

    const apres = harnais.snapshot();
    const mouvements = mouvementsDepuisInstantanes(avant, apres);

    // ── INVARIANT COMPTABLE : somme algébrique des variations = 0. ──────────
    expect(variationTotale(mouvements)).toBe(0);

    // Double entrée explicite : -200 investisseur, +200 wallet projet.
    expect(harnais.walletRow.solde).toBe(800);
    expect(harnais.projectWalletRow.solde).toBe(200);
    expect(mouvements).toHaveLength(2);
  });

  it('investisseur non averti (art. 22) : blocage interne, Σ des variations = 0, rien ne part chez le projet', async () => {
    // Profil absent → non averti par défaut protecteur.
    const avant = harnais.snapshot();

    await harnais.useCase.execute(USER_ID, dto);

    const apres = harnais.snapshot();
    const mouvements = mouvementsDepuisInstantanes(avant, apres);

    // ── INVARIANT COMPTABLE : le blocage déplace 200 € du disponible vers le
    //    bloqué DANS le wallet investisseur — variation nette nulle. ─────────
    expect(variationTotale(mouvements)).toBe(0);
    expect(harnais.walletRow.solde).toBe(800);
    expect(harnais.walletRow.soldeBloque).toBe(200);
    expect(harnais.projectWalletRow.solde).toBe(0);
    expect(harnais.projectWalletResolver.executeInTransaction).not.toHaveBeenCalled();
  });

  it('non-régression : walletDestination n’est JAMAIS null sur la transaction ledger de souscription', async () => {
    // Cas averti → SOUSCRIPTION créditée au wallet projet.
    harnais.profilRepository.findProfilPPByUserId.mockResolvedValue(profilAverti);
    await harnais.useCase.execute(USER_ID, dto);
    expect(txSaves()).toHaveLength(1);
    expect(txSaves()[0][1].type).toBe(TransactionType.SOUSCRIPTION);
    expect(txSaves()[0][1].walletDestination).toBe('wp1');
    expect(txSaves()[0][1].walletDestination).not.toBeNull();
  });

  it('non-régression : le blocage d’escrow (non averti) porte aussi une destination non nulle', async () => {
    await harnais.useCase.execute(USER_ID, dto);
    expect(txSaves()).toHaveLength(1);
    expect(txSaves()[0][1].type).toBe(TransactionType.ESCROW_LOCK);
    expect(txSaves()[0][1].walletDestination).toBe('w1');
    expect(txSaves()[0][1].walletDestination).not.toBeNull();
  });
});

/**
 * ART. 21(7) DU RÈGLEMENT (UE) 2020/1503 — seuil d'avertissement de
 * l'investisseur NON AVERTI.
 *
 * Ce n'est PAS un plafond : au-delà du plus élevé entre 1 000 € et 5 % du
 * patrimoine net, l'investisseur doit recevoir un avertissement sur les
 * risques et donner un consentement EXPLICITE. Le franchissement sans
 * consentement doit donc être refusé, et refusé AVANT toute écriture — un
 * investissement persisté puis « annulé » aurait déjà débité le portefeuille.
 *
 * Le plancher de 1 000 € s'applique en l'absence de profil exploitable : le
 * défaut protecteur est le seuil le plus bas, jamais l'absence de seuil.
 */
describe('CreateInvestmentUseCase — art. 21(7) : seuil d’avertissement du non averti', () => {
  const USER_ID = 42;
  /** Prix d'une fraction : le montant investi vaut nbFractions × 100 €. */
  const PRIX_FRACTION = 100;

  function buildHarnaisSeuil() {
    const projectRow: any = { id: 'p1', statut: ProjectStatus.EN_COLLECTE };
    // Solde volontairement large : le contrôle de solde intervient AVANT le
    // seuil d'avertissement, il ne doit pas masquer ce qu'on teste ici.
    const walletRow: any = { id: 'w1', solde: 100_000, soldeBloque: 0, devise: 'EUR' };
    const projectWalletRow: any = { id: 'wp1', solde: 0, soldeBloque: 0, devise: 'EUR' };

    const manager: any = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === ProjectEntity) return projectRow;
        if (entity === WalletEntity) return walletRow;
        return null;
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
      })),
      save: jest.fn(async (entity: any, obj: any) => {
        if (entity === InvestmentEntity) return { ...obj, id: 'inv-1' };
        return obj;
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
    };

    const profilRepository = {
      findProfilPPByUserId: jest.fn().mockResolvedValue(null),
    };
    const dataSource: any = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };
    const metrics = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };

    const useCase = new CreateInvestmentUseCase(
      {
        findInvestmentById: jest.fn().mockResolvedValue(null),
        countFractionsVendues: jest.fn().mockResolvedValue(0),
        updateBulletinDocId: jest.fn().mockResolvedValue(undefined),
      } as any,
      {
        findProjectById: jest.fn().mockResolvedValue({
          id: 'p1',
          titre: 'Projet Test',
          ville: 'Paris',
          pays: 'FR',
          instrument: 'OBLIGATION',
          statut: ProjectStatus.EN_COLLECTE,
          capitalCible: 100_000,
          ticketMinimum: PRIX_FRACTION,
          ticketMaximum: null,
          nbFractions: 1000,
          triCible: 8,
          dureeMois: 12,
        }),
      } as any,
      {
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        findWalletByUser: jest
          .fn()
          .mockResolvedValue({ id: 'w1', solde: 100_000, devise: 'EUR' }),
      } as any,
      { save: jest.fn().mockResolvedValue({ id: 'd1' }) } as any,
      {
        findById: jest.fn().mockResolvedValue({
          userId: USER_ID,
          firstname: 'Jean',
          lastname: 'Test',
          userEmail: { email: 'jean@example.com' },
        }),
      } as any,
      profilRepository as any,
      { generateBulletin: jest.fn().mockResolvedValue(Buffer.from('pdf')) } as any,
      {
        upload: jest.fn().mockResolvedValue({ objectName: 'o', publicUrl: 'u' }),
      } as any,
      { push: jest.fn(), pushToAdmins: jest.fn() } as any,
      { investmentCreated: jest.fn() } as any,
      dataSource,
      metrics as any,
      {
        executeInTransaction: jest.fn(async () => projectWalletRow),
        findInTransaction: jest.fn(async () => projectWalletRow),
      } as any,
      { check: jest.fn().mockResolvedValue(undefined) } as any,
      { surInvestissementDefinitif: jest.fn().mockResolvedValue(undefined) } as any,
      /* gelDesAvoirs */ { assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined) } as any,
      /* conflitsInterets */ { assertPasPorteurDuProjet: jest.fn().mockResolvedValue(undefined) } as any,
    );

    return { useCase, manager, profilRepository, metrics, dataSource };
  }

  let harnais: ReturnType<typeof buildHarnaisSeuil>;
  beforeEach(() => {
    harnais = buildHarnaisSeuil();
  });

  const savedInvestments = () =>
    harnais.manager.save.mock.calls.filter((c: any) => c[0] === InvestmentEntity);
  const walletSaves = () =>
    harnais.manager.save.mock.calls.filter((c: any) => c[0] === WalletEntity);

  /** Profil non averti dont l'évaluation reste valide un an. */
  const profilNonAverti = (seuil: number, patrimoine = 100_000) => ({
    categoriePsfp: CategorieInvestisseur.NON_AVERTI,
    evaluationExpireLe: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    patrimoineNetCalcule: patrimoine,
    seuilAvertissementCalcule: seuil,
  });

  it('non averti SOUS le seuil : la souscription passe sans consentement', async () => {
    harnais.profilRepository.findProfilPPByUserId.mockResolvedValue(
      profilNonAverti(5_000),
    );

    // 2 × 100 € = 200 €, très en deçà du seuil de 5 000 €.
    const investissement = await harnais.useCase.execute(USER_ID, {
      projetId: 'p1',
      nbFractions: 2,
    } as any);

    expect(investissement.id).toBe('inv-1');
    expect(savedInvestments()).toHaveLength(1);
  });

  it('non averti AU-DESSUS du seuil SANS consentement : refus 400 et AUCUNE écriture', async () => {
    harnais.profilRepository.findProfilPPByUserId.mockResolvedValue(
      profilNonAverti(5_000),
    );

    // 60 × 100 € = 6 000 € > 5 000 €.
    await expect(
      harnais.useCase.execute(USER_ID, {
        projetId: 'p1',
        nbFractions: 60,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Le refus intervient AVANT la section critique : rien n'est persisté,
    // le portefeuille n'est pas débité, la transaction n'est même pas ouverte.
    expect(harnais.dataSource.transaction).not.toHaveBeenCalled();
    expect(savedInvestments()).toHaveLength(0);
    expect(walletSaves()).toHaveLength(0);
  });

  it('non averti AU-DESSUS du seuil AVEC consentementDepassementLimite : la souscription passe', async () => {
    harnais.profilRepository.findProfilPPByUserId.mockResolvedValue(
      profilNonAverti(5_000),
    );

    const investissement = await harnais.useCase.execute(USER_ID, {
      projetId: 'p1',
      nbFractions: 60,
      consentementDepassementLimite: true,
    } as any);

    expect(investissement.id).toBe('inv-1');
    expect(savedInvestments()).toHaveLength(1);
  });

  it('profil absent : le seuil retombe sur le plancher légal de 1 000 € — 1 000 € passe', async () => {
    // Aucun profil PP → non averti par défaut protecteur, patrimoine inconnu
    // (0) → seuil = max(1 000 ; 5 % × 0) = 1 000 €.
    harnais.profilRepository.findProfilPPByUserId.mockResolvedValue(null);

    const investissement = await harnais.useCase.execute(USER_ID, {
      projetId: 'p1',
      nbFractions: 10, // exactement 1 000 € : le seuil n'est pas DÉPASSÉ
    } as any);

    expect(investissement.id).toBe('inv-1');
    expect(savedInvestments()).toHaveLength(1);
  });

  it('profil absent : au-delà du plancher de 1 000 €, refus sans consentement', async () => {
    harnais.profilRepository.findProfilPPByUserId.mockResolvedValue(null);

    await expect(
      harnais.useCase.execute(USER_ID, {
        projetId: 'p1',
        nbFractions: 11, // 1 100 € > 1 000 €
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(savedInvestments()).toHaveLength(0);
    expect(walletSaves()).toHaveLength(0);
  });

  it('évaluation EXPIRÉE : le seuil stocké est ignoré, on recalcule depuis le patrimoine', async () => {
    // Seuil stocké généreux (50 000 €) mais évaluation périmée (art. 21(2),
    // réexamen tous les deux ans) → il ne fait plus foi : le seuil est
    // recalculé, soit max(1 000 ; 5 % × 20 000) = 1 000 €.
    harnais.profilRepository.findProfilPPByUserId.mockResolvedValue({
      categoriePsfp: CategorieInvestisseur.AVERTI,
      evaluationExpireLe: new Date(Date.now() - 24 * 3600 * 1000),
      patrimoineNetCalcule: 20_000,
      seuilAvertissementCalcule: 50_000,
    });

    await expect(
      harnais.useCase.execute(USER_ID, {
        projetId: 'p1',
        nbFractions: 20, // 2 000 € > 1 000 €
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(savedInvestments()).toHaveLength(0);
  });
});
