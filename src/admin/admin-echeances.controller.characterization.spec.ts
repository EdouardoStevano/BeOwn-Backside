import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminEcheancesController } from './admin-echeances.controller';
import { TriggerEcheancePaymentUseCase } from './usecases/trigger-echeance-payment.usecase';
import { GetAggregatedScheduleUseCase } from './usecases/get-aggregated-schedule.usecase';
import { PatchAggregatedEcheanceUseCase } from './usecases/patch-aggregated-echeance.usecase';
import { rolesWithPermission } from 'src/iam/domain/policies/role-permissions.policy';
import {
  EcheanceStatus,
  InvestmentStatus,
} from 'src/subscription/domain/enums/investment-status.enum';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';

/**
 * Tests de CARACTÉRISATION de AdminEcheancesController (audit SOLID vague 4).
 *
 * But : figer le comportement observable des 3 méthodes lourdes AVANT d'en
 * extraire des usecases, pour garantir qu'aucun comportement ne change pendant
 * le refactor (ce contrôleur déclenche des paiements réels et n'avait aucun
 * test). Les tests instancient le contrôleur avec des dépendances mockées ;
 * après extraction ils resteront verts (le contrôleur délègue).
 *
 *  - triggerPayment      : crédit wallet + transaction + statut PAYE, skips, gardes
 *  - getAggregatedSchedule : agrégation par numéro (sommes, date, statut, capital restant)
 *  - patchAggregated     : répartition prorata des montants + gardes
 */
describe('AdminEcheancesController — caractérisation (vague 4)', () => {
  const PAY_ROLE = rolesWithPermission('echeancier:pay')[0];
  const READ_ROLE = rolesWithPermission('echeancier:read')[0];

  let userRepo: any;
  let echeanceRepo: any;
  let investRepo: any;
  let walletRepo: any;
  let txRepo: any;
  let dataSource: any;
  let notifications: any;
  let payEcheance: any;
  let scheduleGenerator: any;
  let controller: AdminEcheancesController;

  const admin = { userId: 1, email: 'a@b.c', role: PAY_ROLE } as any;

  beforeEach(() => {
    userRepo = { findOne: jest.fn() };
    echeanceRepo = {
      find: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    investRepo = { find: jest.fn() };
    walletRepo = { findOne: jest.fn() };
    txRepo = {};
    dataSource = { transaction: jest.fn() };
    notifications = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    payEcheance = { execute: jest.fn() };
    scheduleGenerator = {};

    // Les usecases portent désormais la logique ; on les construit avec les
    // mêmes mocks et on les injecte — les tests exercent le contrôleur qui délègue.
    const triggerEcheancePayment = new TriggerEcheancePaymentUseCase(
      echeanceRepo,
      investRepo,
      dataSource,
      notifications,
    );
    const aggregatedSchedule = new GetAggregatedScheduleUseCase(
      investRepo,
      echeanceRepo,
    );
    const patchAggregatedEcheance = new PatchAggregatedEcheanceUseCase(
      investRepo,
      echeanceRepo,
    );

    controller = new AdminEcheancesController(
      userRepo,
      echeanceRepo,
      investRepo,
      walletRepo,
      txRepo,
      dataSource,
      notifications,
      payEcheance,
      scheduleGenerator,
      triggerEcheancePayment,
      aggregatedSchedule,
      patchAggregatedEcheance,
    );
  });

  // ── triggerPayment ─────────────────────────────────────────────────────────
  describe('triggerPayment', () => {
    beforeEach(() => {
      // assertPay : l'utilisateur a le rôle de paiement.
      userRepo.findOne.mockResolvedValue({ userId: 1, role: PAY_ROLE });
    });

    it('rejette un numéro < 1', async () => {
      await expect(
        controller.triggerPayment('p1', 0, admin, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("404 si aucun investissement confirmé", async () => {
      investRepo.find.mockResolvedValue([]);
      await expect(
        controller.triggerPayment('p1', 1, admin, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(investRepo.find).toHaveBeenCalledWith({
        where: { projetId: 'p1', statut: InvestmentStatus.CONFIRME },
      });
    });

    it('404 si aucune échéance pour ce numéro', async () => {
      investRepo.find.mockResolvedValue([{ id: 'i1', utilisateurId: 7 }]);
      echeanceRepo.find.mockResolvedValue([]);
      await expect(
        controller.triggerPayment('p1', 1, admin, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('crédite le wallet, écrit la transaction, passe l’échéance à PAYE et notifie', async () => {
      investRepo.find.mockResolvedValue([{ id: 'i1', utilisateurId: 7 }]);
      const ech = {
        id: 'e1',
        investissementId: 'i1',
        numero: 1,
        statut: EcheanceStatus.A_VENIR,
        montantTotal: 100,
      };
      echeanceRepo.find.mockResolvedValue([ech]);

      const em = {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'w1', solde: 50, devise: 'EUR' }),
        save: jest.fn(async (_e: any, x: any) => x),
        create: jest.fn((_e: any, x: any) => x),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(em));

      const res = await controller.triggerPayment('p1', 1, admin, {});

      expect(res).toEqual({ paidCount: 1, totalAmount: 100, skipped: 0 });
      // Wallet crédité (+montant).
      const savedWallet = em.save.mock.calls.find(
        (c: any[]) => c[1]?.id === 'w1',
      );
      expect(savedWallet?.[1].solde).toBe(150);
      // Transaction de remboursement capital idempotente.
      const txSave = em.save.mock.calls.find(
        (c: any[]) => c[1]?.idempotencyKey === 'echeance-pay:e1',
      );
      expect(txSave?.[1]).toEqual(
        expect.objectContaining({
          type: TransactionType.REMBOURSEMENT_CAPITAL,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          montant: 100,
          projetId: 'p1',
          investissementId: 'i1',
        }),
      );
      // Échéance marquée payée.
      expect(ech.statut).toBe(EcheanceStatus.PAYE);
      // Notifications investisseur + admins.
      expect(notifications.push).toHaveBeenCalled();
      expect(notifications.pushToAdmins).toHaveBeenCalled();
    });

    it('ignore (skip) une échéance déjà PAYE, sans ouvrir de transaction', async () => {
      investRepo.find.mockResolvedValue([{ id: 'i1', utilisateurId: 7 }]);
      echeanceRepo.find.mockResolvedValue([
        {
          id: 'e1',
          investissementId: 'i1',
          numero: 1,
          statut: EcheanceStatus.PAYE,
          montantTotal: 100,
        },
      ]);

      const res = await controller.triggerPayment('p1', 1, admin, {});

      expect(res).toEqual({ paidCount: 0, totalAmount: 0, skipped: 1 });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  // ── getAggregatedSchedule ──────────────────────────────────────────────────
  describe('getAggregatedSchedule', () => {
    beforeEach(() => {
      userRepo.findOne.mockResolvedValue({ userId: 1, role: READ_ROLE });
    });

    it('retourne [] si aucun investissement', async () => {
      investRepo.find.mockResolvedValue([]);
      await expect(controller.getAggregatedSchedule('p1', admin)).resolves.toEqual(
        [],
      );
    });

    it('agrège par numéro (sommes, date la plus tôt, statut, capital restant)', async () => {
      investRepo.find.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
      echeanceRepo.find.mockResolvedValue([
        // numéro 1 — deux investisseurs A_VENIR
        { numero: 1, datePrevue: '2026-01-15', montantCapital: 300, montantInterets: 30, montantTotal: 330, statut: EcheanceStatus.A_VENIR },
        { numero: 1, datePrevue: '2026-01-10', montantCapital: 100, montantInterets: 10, montantTotal: 110, statut: EcheanceStatus.A_VENIR },
        // numéro 2 — deux investisseurs PAYE
        { numero: 2, datePrevue: '2026-02-10', montantCapital: 100, montantInterets: 5, montantTotal: 105, statut: EcheanceStatus.PAYE },
        { numero: 2, datePrevue: '2026-02-12', montantCapital: 300, montantInterets: 15, montantTotal: 315, statut: EcheanceStatus.PAYE },
      ]);

      const res = await controller.getAggregatedSchedule('p1', admin);

      expect(res).toEqual([
        {
          numero: 1,
          datePrevue: '2026-01-10',
          montantCapital: 400,
          montantInterets: 40,
          montantTotal: 440,
          capitalRestantAvant: 800,
          capitalRestantApres: 400,
          statut: EcheanceStatus.A_VENIR,
          nbInvestisseurs: 2,
          nbPayes: 0,
        },
        {
          numero: 2,
          datePrevue: '2026-02-10',
          montantCapital: 400,
          montantInterets: 20,
          montantTotal: 420,
          capitalRestantAvant: 400,
          capitalRestantApres: 0,
          statut: EcheanceStatus.PAYE,
          nbInvestisseurs: 2,
          nbPayes: 2,
        },
      ]);
    });
  });

  // ── patchAggregated ────────────────────────────────────────────────────────
  describe('patchAggregated', () => {
    beforeEach(() => {
      userRepo.findOne.mockResolvedValue({ userId: 1, role: READ_ROLE });
    });

    it('404 si aucun investissement', async () => {
      investRepo.find.mockResolvedValue([]);
      await expect(
        controller.patchAggregated('p1', 1, {}, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('400 si aucune échéance modifiable (aucune A_VENIR)', async () => {
      investRepo.find.mockResolvedValue([{ id: 'i1', nbTitres: 1 }]);
      echeanceRepo.find.mockResolvedValue([
        { id: 'e1', investissementId: 'i1', statut: EcheanceStatus.PAYE },
      ]);
      await expect(
        controller.patchAggregated('p1', 1, { montantTotal: 100 }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('répartit le montant total au prorata des fractions détenues', async () => {
      investRepo.find.mockResolvedValue([
        { id: 'i1', nbTitres: 1 },
        { id: 'i2', nbTitres: 3 },
      ]);
      echeanceRepo.find.mockResolvedValue([
        { id: 'e1', investissementId: 'i1', statut: EcheanceStatus.A_VENIR, montantCapital: 0, montantInterets: 0 },
        { id: 'e2', investissementId: 'i2', statut: EcheanceStatus.A_VENIR, montantCapital: 0, montantInterets: 0 },
      ]);

      const res = await controller.patchAggregated(
        'p1',
        1,
        { montantTotal: 400 },
        admin,
      );

      expect(res).toEqual({ updated: 2 });
      // i1 : 1/4 → 100 ; i2 : 3/4 → 300
      const e1Update = echeanceRepo.update.mock.calls.find(
        (c: any[]) => c[0]?.id === 'e1',
      );
      const e2Update = echeanceRepo.update.mock.calls.find(
        (c: any[]) => c[0]?.id === 'e2',
      );
      expect(e1Update?.[1].montantTotal).toBe(100);
      expect(e2Update?.[1].montantTotal).toBe(300);
    });
  });
});
