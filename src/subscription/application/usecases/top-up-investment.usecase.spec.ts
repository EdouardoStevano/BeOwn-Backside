import { TopUpInvestmentUseCase } from './top-up-investment.usecase';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceEntity } from 'src/subscription/infrastructure/persistence/entities/echeance.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { Investment } from 'src/subscription/domain/aggregates/investment';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import {
  FractionsDemandeesIndisponiblesError,
  SoldeInsuffisantError,
} from 'src/subscription/domain/errors/subscription.errors';

/**
 * Vérifie l'atomicité du top-up (ajout de fractions à un investissement
 * existant). Même modèle que create : la section monétaire (recompte sous
 * verrou, débit sous verrou, mise à jour nbTitres/montant, ledger, échéancier)
 * vit dans dataSource.transaction. On prouve : chemin heureux (débit unique +
 * mise à jour), solde insuffisant SOUS VERROU → throw sans écriture, survente
 * SOUS VERROU → throw sans écriture, et enveloppe transactionnelle + verrous.
 *
 * Le repository rend désormais un véritable agrégat : c'est
 * `Investment.completer` qui éprouve la titularité, le statut et les fractions
 * actives, et qui rend le montant à débiter.
 */
describe('TopUpInvestmentUseCase — atomicité', () => {
  let useCase: TopUpInvestmentUseCase;
  let investmentRepository: any;
  let projectRepository: any;
  let walletRepository: any;
  let documentRepository: any;
  let userRepository: any;
  let contractGenerator: any;
  let cloudStorage: any;
  let notificationEvents: any;
  let eventBus: any;
  let dataSource: any;
  let manager: any;

  let projectRow: any;
  let walletRow: any;
  let lockedSoldTotal: number;

  const USER_ID = 42;
  const INVEST_ID = 'inv1';

  const baseInvestment = () =>
    new Investment({
      id: INVEST_ID,
      projetId: 'p1',
      utilisateurId: USER_ID,
      montant: 500,
      instrument: 'OBLIGATION',
      nbTitres: 5,
      valeurTitre: 100,
      statut: InvestmentStatus.CONFIRME,
      delaiRetractationJusquAu: null,
      bulletinDocId: null,
      signatureId: null,
      reservationId: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      projet: {
        id: 'p1',
        titre: 'Projet Test',
        ville: 'Paris',
        pays: 'FR',
        type: 'RESIDENTIEL',
        triCible: 8,
        dureeMois: 12,
        prixFraction: 100,
        nbFractions: 100,
      },
    });

  const baseProject = () => ({
    id: 'p1',
    titre: 'Projet Test',
    ville: 'Paris',
    pays: 'FR',
    instrument: 'OBLIGATION',
    statut: ProjectStatus.EN_COLLECTE,
    ticketMaximum: null,
    prixUnitaireFraction: 100,
    nbFractionsTotal: 100,
    triCible: 8,
    dureeMois: 12,
  });

  beforeEach(() => {
    projectRow = { id: 'p1', statut: ProjectStatus.EN_COLLECTE };
    walletRow = { id: 'w1', solde: 1000, devise: 'EUR' };
    lockedSoldTotal = 5;

    investmentRepository = {
      findById: jest.fn().mockResolvedValue(baseInvestment()),
      save: jest.fn(async (inv: any) => inv),
    };
    projectRepository = {
      findProjectById: jest.fn().mockResolvedValue(baseProject()),
    };
    walletRepository = {
      findWalletByUser: jest
        .fn()
        .mockResolvedValue({ id: 'w1', solde: 1000, devise: 'EUR' }),
    };
    documentRepository = {
      save: jest.fn().mockResolvedValue({ id: 'd1' }),
      findById: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = {
      findById: jest.fn().mockResolvedValue({
        userId: USER_ID,
        firstname: 'Jean',
        lastname: 'Test',
        email: 'jean@example.com',
      }),
    };
    contractGenerator = {
      generateBulletin: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    cloudStorage = {
      upload: jest.fn().mockResolvedValue({ objectName: 'o', publicUrl: 'u' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    notificationEvents = { fractionsToppedUp: jest.fn() };
    eventBus = { publish: jest.fn() };

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
      save: jest.fn(async (_entity: any, obj: any) => obj),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };

    useCase = new TopUpInvestmentUseCase(
      investmentRepository,
      projectRepository,
      walletRepository,
      documentRepository,
      userRepository,
      contractGenerator,
      cloudStorage,
      notificationEvents,
      eventBus,
      dataSource,
    );
  });

  const investmentUpdates = () =>
    manager.update.mock.calls.filter((c: any) => c[0] === InvestmentEntity);
  const walletSaves = () =>
    manager.save.mock.calls.filter((c: any) => c[0] === WalletEntity);

  const withLockedFractionsSold = (total: string) => {
    manager.createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total }),
    }));
  };

  it('chemin heureux : débite une fois et met à jour nbTitres + montant dans la transaction', async () => {
    const result = await useCase.execute(INVEST_ID, USER_ID, 2);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    const projLock = manager.findOne.mock.calls.find(
      (c: any) => c[0] === ProjectEntity,
    );
    const walletLock = manager.findOne.mock.calls.find(
      (c: any) => c[0] === WalletEntity,
    );
    expect(projLock[1].lock).toEqual({ mode: 'pessimistic_write' });
    expect(walletLock[1].lock).toEqual({ mode: 'pessimistic_write' });

    // Mise à jour unique : 5 + 2 = 7 titres, 500 + 200 = 700 de montant.
    expect(investmentUpdates()).toHaveLength(1);
    expect(investmentUpdates()[0][2]).toEqual({ nbTitres: 7, montant: 700 });

    // Débit unique : 1000 − 200 = 800.
    expect(walletSaves()).toHaveLength(1);
    expect(walletSaves()[0][1].solde).toBe(800);

    // Échéancier régénéré dans la transaction (delete + save).
    expect(
      manager.delete.mock.calls.some((c: any) => c[0] === EcheanceEntity),
    ).toBe(true);

    // Ledger : le complément débité, pas le total.
    const txSaves = manager.save.mock.calls.filter(
      (c: any) => c[0] === TransactionEntity,
    );
    expect(txSaves).toHaveLength(1);
    expect(txSaves[0][1].montant).toBe(200);

    expect(result.nbTitres).toBe(7);
    expect(result.montant).toBe(700);
  });

  it('solde insuffisant relu SOUS VERROU → throw, aucune écriture', async () => {
    walletRow = { id: 'w1', solde: 50, devise: 'EUR' };

    await expect(useCase.execute(INVEST_ID, USER_ID, 2)).rejects.toBeInstanceOf(
      SoldeInsuffisantError,
    );
    expect(investmentUpdates()).toHaveLength(0);
    expect(walletSaves()).toHaveLength(0);
  });

  it('survente recomptée SOUS VERROU → throw, aucune écriture', async () => {
    // 99 déjà vendues sous verrou → 1 dispo < 2 demandées.
    withLockedFractionsSold('99');

    await expect(useCase.execute(INVEST_ID, USER_ID, 2)).rejects.toBeInstanceOf(
      FractionsDemandeesIndisponiblesError,
    );
    expect(investmentUpdates()).toHaveLength(0);
    expect(walletSaves()).toHaveLength(0);
  });
});
