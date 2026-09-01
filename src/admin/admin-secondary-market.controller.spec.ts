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
import { UserRole } from 'src/iam/domains/enums/user.enum';

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

    sellerWallet = { id: 'w-seller', proprietaireUserId: 1, type: WalletType.INVESTISSEUR, solde: 1000, devise: 'EUR' };
    buyerWallet = { id: 'w-buyer', proprietaireUserId: 2, type: WalletType.INVESTISSEUR, solde: 0, devise: 'EUR' };
    platformWallet = { id: 'w-plat', type: WalletType.FRAIS_PLATEFORME, solde: 100, devise: 'EUR' };
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

// ═══════════════════════════════════════════════════════════════════════════
// Cas A — la cession n'a JAMAIS été réglée.
//
// La reverse financière défait un règlement : elle recrédite l'acheteur, débite
// le vendeur du net qu'il avait perçu et rend les fractions. Sur un ordre
// INTERET_EXPRIME ou ACCEPTE, rien de tout cela n'a eu lieu — la jouer quand
// même créditait l'acheteur d'un montant jamais versé et débitait le vendeur
// d'un produit jamais perçu : de l'argent créé à chaque annulation.
// ═══════════════════════════════════════════════════════════════════════════

describe('AdminSecondaryMarketController — cancelOrder Cas A (aucun mouvement)', () => {
  const admin = { userId: 99 };

  const build = (ordre: any) => {
    const ecritures: Array<{ entite: any; set: any; where: any }> = [];
    const walletAcheteur = {
      id: 'w-buyer',
      solde: 0,
      soldeBloque: 300,
    };

    const em: any = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_e: any, o: any) => o),
      save: jest.fn(async (_e: any, o: any) => o),
      createQueryBuilder: jest.fn(() => {
        let entite: any = null;
        let valeurs: any = null;
        let cible: any = null;
        const qb: any = {
          update: jest.fn((e: any) => {
            entite = e;
            return qb;
          }),
          set: jest.fn((v: any) => {
            valeurs = v;
            return qb;
          }),
          setParameter: jest.fn(() => qb),
          where: jest.fn((_clause: string, params: any) => {
            cible = params;
            return qb;
          }),
          execute: jest.fn(async () => {
            ecritures.push({ entite, set: valeurs, where: cible });
            if (entite === WalletEntity) {
              // Libération réelle : la poche bloquée redevient disponible.
              walletAcheteur.solde += 300;
              walletAcheteur.soldeBloque -= 300;
            }
            return { affected: 1 };
          }),
        };
        return qb;
      }),
    };

    const ordreRepo = { findOne: jest.fn().mockResolvedValue(ordre), save: jest.fn() };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 99, role: UserRole.SUPER_ADMIN }),
    };
    const notificationService = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(em)) };

    const controller = new AdminSecondaryMarketController(
      ordreRepo as any,
      {} as any,
      userRepo as any,
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      dataSource,
      notificationService as any,
      { secondaryTradeExecuted: jest.fn() } as any,
      {} as any,
    );

    return { controller, ecritures, notificationService, walletAcheteur, em };
  };

  const ordreAccepte = () => ({
    id: 'ord-2',
    investissementId: 'inv-seller',
    investissement: { projetId: 'proj-1' },
    vendeurId: 1,
    acheteurId: 2,
    nbFractions: 10,
    montant: 1000,
    prixUnitaire: 100,
    interetNbFractions: 3,
    statut: OrdreMarcheStatus.ACCEPTE,
  });

  it.each([
    [OrdreMarcheStatus.INTERET_EXPRIME],
    [OrdreMarcheStatus.ACCEPTE],
    [OrdreMarcheStatus.EN_CARNET],
    [OrdreMarcheStatus.MATCH_PROPOSE],
  ])('statut %s : annulation SANS reverse financière', async (statut) => {
    const { controller, ecritures } = build({ ...ordreAccepte(), statut });

    const result = await controller.cancelOrder('ord-2', admin as any);

    expect(result.reversed).toBe(false);
    expect(result.statut).toBe(OrdreMarcheStatus.ANNULE);
    // Aucune écriture au grand livre : pas une seule transaction créée.
    expect(
      ecritures.some((e) => e.entite === TransactionEntity),
    ).toBe(false);
  });

  it("purge l'acheteur et sa marque d'intérêt de l'annonce annulée", async () => {
    const { controller, ecritures } = build(ordreAccepte());

    await controller.cancelOrder('ord-2', admin as any);

    const annulation = ecritures.find((e) => e.entite === OrdreMarcheEntity);
    expect(annulation?.set).toEqual({
      statut: OrdreMarcheStatus.ANNULE,
      acheteurId: null,
      interetNbFractions: null,
      interetExprimeLe: null,
    });
  });

  it('annule la signature encore PENDING : personne ne signe une annonce retirée', async () => {
    const { controller, ecritures } = build(ordreAccepte());

    await controller.cancelOrder('ord-2', admin as any);

    const signature = ecritures.find((e) => e.entite === SignatureEntity);
    expect(signature?.set).toEqual({ statut: SignatureStatus.CANCELLED });
    expect(signature?.where).toMatchObject({
      ordreId: 'ord-2',
      pending: SignatureStatus.PENDING,
    });
  });

  it('rend les fonds RÉSERVÉS sans faire varier les fonds détenus', async () => {
    const { controller, walletAcheteur } = build(ordreAccepte());
    const detenusAvant = walletAcheteur.solde + walletAcheteur.soldeBloque;

    const result = await controller.cancelOrder('ord-2', admin as any);

    // 3 fractions × 100 € = 300 € rendus disponibles ; l'argent ne quitte pas
    // le portefeuille, il change seulement de poche.
    expect(result.montantLibere).toBe(300);
    expect(walletAcheteur.solde).toBe(300);
    expect(walletAcheteur.soldeBloque).toBe(0);
    expect(walletAcheteur.solde + walletAcheteur.soldeBloque).toBe(detenusAvant);
  });

  it("ne libère rien sur une annonce jamais acceptée (aucun fonds n'y était réservé)", async () => {
    const { controller, walletAcheteur } = build({
      ...ordreAccepte(),
      statut: OrdreMarcheStatus.INTERET_EXPRIME,
    });

    const result = await controller.cancelOrder('ord-2', admin as any);

    expect(result.montantLibere).toBe(0);
    expect(walletAcheteur.soldeBloque).toBe(300); // intact
  });

  it("prévient le vendeur ET l'acheteur pressenti", async () => {
    const { controller, notificationService } = build(ordreAccepte());

    await controller.cancelOrder('ord-2', admin as any);

    const destinataires = notificationService.push.mock.calls.map(
      (appel: any[]) => appel[0].utilisateurId,
    );
    expect(destinataires).toEqual(expect.arrayContaining([1, 2]));
  });

  it('refuse une annonce déjà annulée ou expirée', async () => {
    const { controller } = build({
      ...ordreAccepte(),
      statut: OrdreMarcheStatus.ANNULE,
    });

    await expect(
      controller.cancelOrder('ord-2', admin as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
