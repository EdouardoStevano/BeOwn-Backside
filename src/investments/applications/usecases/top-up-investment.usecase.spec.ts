import { BadRequestException } from '@nestjs/common';
import { TopUpInvestmentUseCase } from './top-up-investment.usecase';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { TransactionType } from 'src/wallets/domains/enums/wallet.enum';
import {
  mouvementsDepuisInstantanes,
  variationTotale,
  PositionWallet,
} from 'src/wallets/domains/grand-livre';

/**
 * Vérifie l'atomicité du top-up (ajout de fractions à un investissement
 * existant). Même modèle que create : la section monétaire (recompte sous
 * verrou, débit sous verrou, mise à jour nbTitres/montant, ledger, échéancier)
 * vit dans dataSource.transaction. On prouve : chemin heureux (débit unique +
 * mise à jour), solde insuffisant SOUS VERROU → throw sans écriture, survente
 * SOUS VERROU → throw sans écriture, et enveloppe transactionnelle + verrous.
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
  let notificationService: any;
  let notificationEvents: any;
  let dataSource: any;
  let manager: any;

  let projectRow: any;
  let walletRow: any;
  let projectWalletRow: any; // wallet technique du projet (grand livre)
  let projectWalletResolver: any;
  let lockedSoldTotal: number;

  const USER_ID = 42;
  const INVEST_ID = 'inv1';

  /** Instantané { walletId → position } pour la preuve d'invariant comptable. */
  const snapshotWallets = (): Map<string, PositionWallet> =>
    new Map(
      [walletRow, projectWalletRow].map((w: any) => [
        w.id,
        { solde: Number(w.solde), soldeBloque: Number(w.soldeBloque ?? 0) },
      ]),
    );

  const baseInvestment = () => ({
    id: INVEST_ID,
    utilisateurId: USER_ID,
    statut: InvestmentStatus.CONFIRME,
    nbTitres: 5,
    montant: 500,
    valeurTitre: 100,
    projetId: 'p1',
    bulletinDocId: null,
    projet: { id: 'p1', titre: 'Projet Test' },
  });

  const baseProject = () => ({
    id: 'p1',
    titre: 'Projet Test',
    ville: 'Paris',
    pays: 'FR',
    statut: ProjectStatus.EN_COLLECTE,
    capitalCible: 10000,
    ticketMinimum: 100,
    prixFraction: 100,
    nbFractions: 100,
    triCible: 8,
    dureeMois: 12,
  });

  beforeEach(() => {
    projectRow = { id: 'p1', statut: ProjectStatus.EN_COLLECTE };
    walletRow = { id: 'w1', solde: 1000, soldeBloque: 0, devise: 'EUR' };
    projectWalletRow = { id: 'wp1', solde: 500, soldeBloque: 0, devise: 'EUR' };
    lockedSoldTotal = 5;

    projectWalletResolver = {
      executeInTransaction: jest.fn().mockImplementation(async () => projectWalletRow),
      findInTransaction: jest.fn().mockImplementation(async () => projectWalletRow),
    };

    investmentRepository = {
      findInvestmentById: jest.fn().mockResolvedValue(baseInvestment()),
      countFractionsVendues: jest.fn().mockResolvedValue(5),
      updateBulletinDocId: jest.fn().mockResolvedValue(undefined),
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
        userEmail: { email: 'jean@example.com' },
      }),
    };
    contractGenerator = {
      generateBulletin: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    cloudStorage = {
      upload: jest.fn().mockResolvedValue({ objectName: 'o', publicUrl: 'u' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    notificationService = { push: jest.fn(), pushToAdmins: jest.fn() };
    notificationEvents = { fractionsToppedUp: jest.fn() };

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
      notificationService,
      notificationEvents,
      dataSource,
      projectWalletResolver,
      /* conflitsInterets */ {
        assertPasPorteurDuProjet: jest.fn().mockResolvedValue(undefined),
      } as any,
    );
  });

  const investmentUpdates = () =>
    manager.update.mock.calls.filter((c: any) => c[0] === InvestmentEntity);
  const walletSaves = () =>
    manager.save.mock.calls.filter((c: any) => c[0] === WalletEntity);

  it('chemin heureux : débite une fois, crédite le wallet projet et met à jour nbTitres + montant dans la transaction', async () => {
    const avant = snapshotWallets();
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

    // GRAND LIVRE — double entrée : débit investisseur (1000 − 200 = 800) ET
    // crédit du wallet technique du projet (500 + 200 = 700).
    expect(walletSaves()).toHaveLength(2);
    expect(walletRow.solde).toBe(800);
    expect(projectWalletRow.solde).toBe(700);

    // ── INVARIANT COMPTABLE (scénario : ajout de fractions) — Σ des
    //    variations de solde de TOUS les wallets = 0. ──────────────────────
    const mouvements = mouvementsDepuisInstantanes(avant, snapshotWallets());
    expect(variationTotale(mouvements)).toBe(0);

    // La transaction ledger relie les deux jambes du mouvement : jamais de
    // destination nulle sur une SOUSCRIPTION (non-régression grand livre).
    const txSaves = manager.save.mock.calls.filter(
      (c: any) => c[0] === TransactionEntity,
    );
    expect(txSaves).toHaveLength(1);
    expect(txSaves[0][1].type).toBe(TransactionType.SOUSCRIPTION);
    expect(txSaves[0][1].walletSource).toBe('w1');
    expect(txSaves[0][1].walletDestination).toBe('wp1');
    expect(txSaves[0][1].walletDestination).not.toBeNull();

    // Échéancier régénéré dans la transaction (delete + save).
    expect(
      manager.delete.mock.calls.some((c: any) => c[0] === EcheanceEntity),
    ).toBe(true);

    expect(result.nbTitres).toBe(7);
    expect(result.montant).toBe(700);
  });

  it('solde insuffisant relu SOUS VERROU → throw, aucune écriture', async () => {
    walletRow = { id: 'w1', solde: 50, devise: 'EUR' };

    await expect(useCase.execute(INVEST_ID, USER_ID, 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(investmentUpdates()).toHaveLength(0);
    expect(walletSaves()).toHaveLength(0);
  });

  it('survente recomptée SOUS VERROU → throw, aucune écriture', async () => {
    // 99 déjà vendues sous verrou → 1 dispo < 2 demandées.
    manager.createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '99' }),
    }));

    await expect(useCase.execute(INVEST_ID, USER_ID, 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(investmentUpdates()).toHaveLength(0);
    expect(walletSaves()).toHaveLength(0);
  });

  describe('idempotence sur la clé du client', () => {
    const CLE = 'cle-client-suffisamment-longue';

    beforeEach(() => {
      walletRepository.findTransactionByIdempotencyKey = jest
        .fn()
        .mockResolvedValue(null);
    });

    it('deux appels avec la MÊME clé : un seul top-up, le second rend l’investissement déjà complété', async () => {
      // Premier appel : aucun antécédent, le top-up s'exécute.
      await useCase.execute(INVEST_ID, USER_ID, 2, CLE);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);

      // L'écriture porte la clé du client, adossée à la contrainte d'unicité.
      const txSaves = manager.save.mock.calls.filter(
        (c: any) => c[0] === TransactionEntity,
      );
      expect(txSaves[0][1].idempotencyKey).toBe(
        `topup:${USER_ID}:${INVEST_ID}:${CLE}`,
      );

      // Second appel : l'écriture existe, AUCUNE nouvelle transaction ouverte,
      // aucun nouveau débit — l'appelant reçoit l'état courant.
      walletRepository.findTransactionByIdempotencyKey.mockResolvedValue({
        id: 'tx-topup-1',
      });
      const rejoue = await useCase.execute(INVEST_ID, USER_ID, 2, CLE);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(rejoue.id).toBe(INVEST_ID);
    });

    it('course sur la même clé : le perdant du 23505 rend l’investissement du gagnant, pas une 500', async () => {
      // Les deux retries passent le pré-check ; la contrainte d'unicité en base
      // rejette le second INSERT et sa transaction est annulée en bloc.
      manager.save.mockImplementation(async (entity: any, obj: any) => {
        if (entity === TransactionEntity) {
          throw Object.assign(new Error('duplicate key'), { code: '23505' });
        }
        return obj;
      });

      const resultat = await useCase.execute(INVEST_ID, USER_ID, 2, CLE);

      expect(resultat.id).toBe(INVEST_ID);
    });

    it('sans clé du client : clé horodatée, jamais de collision entre deux top-ups légitimes', async () => {
      await useCase.execute(INVEST_ID, USER_ID, 2);

      const txSaves = manager.save.mock.calls.filter(
        (c: any) => c[0] === TransactionEntity,
      );
      expect(txSaves[0][1].idempotencyKey).toMatch(
        new RegExp(`^topup:${USER_ID}:${INVEST_ID}:\\d+$`),
      );
    });
  });
});
