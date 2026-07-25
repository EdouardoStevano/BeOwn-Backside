import { BadRequestException } from '@nestjs/common';
import { CreateInvestmentUseCase } from './create-investment.usecase';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

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
    walletRow = { id: 'w1', solde: 1000, devise: 'EUR' };
    lockedSoldTotal = 0;

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
