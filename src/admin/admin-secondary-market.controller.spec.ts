import { BadRequestException } from '@nestjs/common';
import { AdminSecondaryMarketController } from './admin-secondary-market.controller';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { TransactionStatus, WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

/**
 * Ordre EXECUTE typique : 100 fractions vendues au total en DEUX fills
 * successifs (fill1 = 60 fr, fees 6 ; fill2 = 40 fr, fees 4). L'état courant
 * de l'ordre ne reflète QUE le dernier fill (nbFractions=40, acheteurId=
 * buyer2, prixUnitaire=10 → montantTotal=400) — voir yousign-webhook étape 6.
 */
const buildOrdre = (overrides: Record<string, unknown> = {}) => ({
  id: 'ord-1',
  investissementId: 'inv-seller',
  investissement: { projetId: 'proj-1' },
  vendeurId: 1,
  acheteurId: 2,
  nbFractions: 40,
  montant: 400,
  prixUnitaire: 10,
  statut: OrdreMarcheStatus.EXECUTE,
  ...overrides,
});

describe('AdminSecondaryMarketController — cancelOrder Cas B (reverse)', () => {
  let controller: AdminSecondaryMarketController;
  let ordreRepo: any;
  let userRepo: any;
  let projectRepo: any;
  let notificationService: any;
  let notificationEvents: any;

  let feeTxsList: any[];
  let signatureFindOneResult: any;
  let sellerWallet: any;
  let buyerWallet: any;
  let platformWallet: any;
  let sellerInvest: any;
  let buyerInvest: any;
  let ordreSaved: any;

  const admin = { userId: 99 };

  beforeEach(() => {
    ordreRepo = { findOne: jest.fn(), save: jest.fn() };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 99, role: UserRole.SUPER_ADMIN }),
    };
    projectRepo = { findOne: jest.fn().mockResolvedValue(null) };
    notificationService = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    notificationEvents = { secondaryTradeExecuted: jest.fn() };

    feeTxsList = [];
    signatureFindOneResult = null;

    sellerWallet = { id: 'w-seller', proprietaireUserId: 1, type: WalletType.INVESTISSEUR, solde: 1000, devise: 'XOF' };
    buyerWallet = { id: 'w-buyer', proprietaireUserId: 2, type: WalletType.INVESTISSEUR, solde: 0, devise: 'XOF' };
    platformWallet = { id: 'w-plat', type: WalletType.FRAIS_PLATEFORME, solde: 100, devise: 'XOF' };
    sellerInvest = { id: 'inv-seller', nbTitres: 60, montant: 600, statut: InvestmentStatus.CONFIRME };
    buyerInvest = { id: 'inv-buyer', utilisateurId: 2, projetId: 'proj-1', nbTitres: 40, montant: 400, statut: InvestmentStatus.CONFIRME };
    ordreSaved = null;

    const feeTxsQB = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(() => Promise.resolve(feeTxsList)),
    };

    const em: any = {
      findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
        if (entity === TransactionEntity) {
          // legacy commission lookup — pas de tx legacy dans ces scénarios
          return Promise.resolve(null);
        }
        if (entity === SignatureEntity) {
          return Promise.resolve(signatureFindOneResult);
        }
        if (entity === InvestmentEntity) {
          if (opts.where?.id === 'inv-seller') return Promise.resolve(sellerInvest);
          if (opts.where?.utilisateurId === 2) return Promise.resolve(buyerInvest);
          return Promise.resolve(null);
        }
        if (entity === WalletEntity) {
          if (opts.where?.proprietaireUserId === 2) return Promise.resolve(buyerWallet);
          if (opts.where?.proprietaireUserId === 1) return Promise.resolve(sellerWallet);
          if (opts.where?.type === WalletType.FRAIS_PLATEFORME) return Promise.resolve(platformWallet);
        }
        return Promise.resolve(null);
      }),
      createQueryBuilder: jest.fn().mockReturnValue(feeTxsQB),
      create: jest.fn().mockImplementation((_entity, obj) => obj),
      save: jest.fn().mockImplementation((entity: any, obj: any) => {
        if (entity === OrdreMarcheEntity) ordreSaved = obj;
        return Promise.resolve(obj);
      }),
    };

    const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(em)) };

    controller = new AdminSecondaryMarketController(
      ordreRepo,
      {} as any, // investRepo (non utilisé par cancelOrder directement)
      userRepo,
      {} as any, // walletRepo
      {} as any, // txRepo
      projectRepo,
      dataSource,
      notificationService,
      notificationEvents,
      {} as any, // platformFees (non utilisé par cancelOrder)
    );
  });

  it('fill unique : reverse la somme de TOUS les fee tx (comportement inchangé)', async () => {
    feeTxsList = [
      { montant: 6, statut: TransactionStatus.REUSSI, metadata: { signatureId: 'sig-2', ordreId: 'ord-1', source: 'revente_transaction' } },
      { montant: 4, statut: TransactionStatus.REUSSI, metadata: { signatureId: 'sig-2', ordreId: 'ord-1', source: 'gain_revente_actions' } },
    ];
    ordreRepo.findOne.mockResolvedValue(buildOrdre());

    const result = await controller.cancelOrder('ord-1', admin as any);

    expect(result.success).toBe(true);
    expect(result.reversed).toBe(true);
    // commissionPrelevee = 6 + 4 = 10 (un seul signatureId → pas d'ambiguïté)
    expect(sellerWallet.solde).toBe(1000 - (400 - 10)); // 610
    expect(buyerWallet.solde).toBe(0 + 400); // 400
    expect(platformWallet.solde).toBe(100 - 10); // 90
    expect(ordreSaved.statut).toBe(OrdreMarcheStatus.ANNULE);
  });

  it('multi-remplissages : ne reverse QUE les frais du DERNIER fill (signature la plus récente), pas la somme de tous les fills', async () => {
    // fill1 (sig-1, 60 fr) : fees 6 ; fill2 (sig-2, 40 fr, = le fill actuel) : fees 4
    feeTxsList = [
      { montant: 6, statut: TransactionStatus.REUSSI, metadata: { signatureId: 'sig-1', ordreId: 'ord-1', source: 'revente_transaction' } },
      { montant: 4, statut: TransactionStatus.REUSSI, metadata: { signatureId: 'sig-2', ordreId: 'ord-1', source: 'revente_transaction' } },
    ];
    signatureFindOneResult = { id: 'sig-2', ordreId: 'ord-1', userId: 2, statut: SignatureStatus.SIGNED };
    ordreRepo.findOne.mockResolvedValue(buildOrdre());

    const result = await controller.cancelOrder('ord-1', admin as any);

    expect(result.success).toBe(true);
    // commissionPrelevee = 4 SEULEMENT (fee du fill2/sig-2, pas 6+4=10)
    expect(sellerWallet.solde).toBe(1000 - (400 - 4)); // 604, PAS 610 (bug: 390 net)
    expect(platformWallet.solde).toBe(100 - 4); // 96, PAS 90
  });

  it('multi-remplissages sans signature identifiable : refuse avec 400 plutôt que de reverser un montant faux', async () => {
    feeTxsList = [
      { montant: 6, statut: TransactionStatus.REUSSI, metadata: { signatureId: 'sig-1', ordreId: 'ord-1', source: 'revente_transaction' } },
      { montant: 4, statut: TransactionStatus.REUSSI, metadata: { signatureId: 'sig-2', ordreId: 'ord-1', source: 'revente_transaction' } },
    ];
    // Aucune signature SIGNED retrouvée pour (ordreId, acheteurId) — identité
    // du dernier fill impossible à établir.
    signatureFindOneResult = null;
    ordreRepo.findOne.mockResolvedValue(buildOrdre());

    let caught: any;
    try {
      await controller.cancelOrder('ord-1', admin as any);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect(caught.message).toMatch(/multi-remplissages/);
    // Rien n'a été muté (throw avant toute écriture)
    expect(sellerWallet.solde).toBe(1000);
    expect(platformWallet.solde).toBe(100);
  });

  it('aucun frais prélevé (ordre très ancien / legacy vide) : reverse sans commission', async () => {
    feeTxsList = [];
    ordreRepo.findOne.mockResolvedValue(buildOrdre());

    const result = await controller.cancelOrder('ord-1', admin as any);

    expect(result.success).toBe(true);
    expect(sellerWallet.solde).toBe(1000 - 400); // pas de commission à retirer
    expect(buyerWallet.solde).toBe(400);
    expect(platformWallet.solde).toBe(100); // wallet plateforme non touché
  });
});
