import {
  AccountDeletionBlockedError,
  AccountDeletionNotAllowedError,
  UserNotFoundError,
} from 'src/iam/domains/errors';
import { QueryFailedError } from 'typeorm';
import { DeleteAccountUseCase } from 'src/iam/applications/usecases/delete-account.usecase';
import { UserStatus } from 'src/iam/domains/enums/user.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import {
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';

/**
 * Chaque bloqueur est isolé puis combiné. Les repos sont mockés — on vérifie
 * la LOGIQUE de décision (quels statuts bloquent, quand le retrait auto part,
 * la garde anti-doublon, l'atomicité, l'idempotence) et la forme du 409.
 *
 * Le retrait auto s'exécute dans dataSource.transaction : le mock invoque le
 * callback avec un EntityManager simulé (findOne verrouillé + save). L'état du
 * wallet verrouillé et d'un éventuel retrait en attente est configurable par
 * test via `lockedWallet` / `pendingTx`.
 */
describe('DeleteAccountUseCase', () => {
  let useCase: DeleteAccountUseCase;
  let userRepo: any;
  let investRepo: any;
  let ordreRepo: any;
  let walletRepo: any;
  let txRepo: any;
  let dataSource: any;
  let manager: any;
  let notifications: any;
  let notificationEvents: any;
  let templates: any;
  let emailService: any;

  // État du portefeuille tel que relu SOUS VERROU dans la transaction.
  let lockedWallet: any;
  // Retrait déjà en attente vu sous verrou (null = aucun).
  let pendingTx: any;

  const USER_ID = 42;
  const SELF = { userId: USER_ID, role: 'investisseur' };
  const ADMIN = { userId: 1, role: 'super_admin' };

  const baseUser = () => ({
    userId: USER_ID,
    firstname: 'Jean',
    status: UserStatus.ACTIF,
    role: 'investisseur',
    userEmail: { email: 'jean@example.com' },
  });

  beforeEach(() => {
    lockedWallet = null;
    pendingTx = null;

    userRepo = {
      findOne: jest.fn().mockResolvedValue(baseUser()),
      save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
    };
    investRepo = { count: jest.fn().mockResolvedValue(0) };
    ordreRepo = { count: jest.fn().mockResolvedValue(0) };
    walletRepo = { findOne: jest.fn().mockResolvedValue(null) };
    txRepo = { findOne: jest.fn().mockResolvedValue(null) };

    manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === WalletEntity) return lockedWallet;
        if (entity === TransactionEntity) return pendingTx;
        return null;
      }),
      create: jest.fn((_entity: any, obj: any) => obj),
      save: jest.fn(async (entity: any, obj: any) =>
        entity === TransactionEntity ? { id: 'tx-new', ...obj } : obj,
      ),
    };
    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };

    notifications = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue([]),
    };
    notificationEvents = {
      accountDeletedByUser: jest.fn().mockResolvedValue(undefined),
    };
    templates = {
      render: jest
        .fn()
        .mockResolvedValue({ sujet: 'Compte supprimé', html: '<html></html>' }),
    };
    emailService = {
      sendTransactionalEmail: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new DeleteAccountUseCase(
      userRepo,
      investRepo,
      ordreRepo,
      walletRepo,
      txRepo,
      dataSource,
      notifications,
      notificationEvents,
      templates,
      emailService,
    );
  });

  /** Prépare un solde positif avec IBAN historique connu. */
  const givenBalanceWithIban = (solde: number) => {
    walletRepo.findOne.mockResolvedValue({ id: 'w1', solde, devise: 'EUR' });
    txRepo.findOne.mockResolvedValue({
      id: 'old',
      type: TransactionType.RETRAIT,
      fournisseurRef: 'FR7612345',
      metadata: { ibanDestination: 'FR7612345' },
    });
    lockedWallet = { id: 'w1', solde, devise: 'EUR' };
  };

  // ── Introuvable / idempotence ───────────────────────────────────────────────

  it('lève 404 si utilisateur introuvable', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(useCase.execute(USER_ID, SELF)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('cible déjà SUPPRIME → no-op idempotent, sans email ni notif ni event', async () => {
    userRepo.findOne.mockResolvedValue({
      ...baseUser(),
      status: UserStatus.SUPPRIME,
    });
    await expect(useCase.execute(USER_ID, ADMIN)).resolves.toBeUndefined();
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(templates.render).not.toHaveBeenCalled();
    expect(emailService.sendTransactionalEmail).not.toHaveBeenCalled();
    expect(notifications.push).not.toHaveBeenCalled();
    expect(notificationEvents.accountDeletedByUser).not.toHaveBeenCalled();
  });

  // ── Bloqueurs isolés ───────────────────────────────────────────────────────

  it('bloque sur ACTIVE_INVESTMENTS', async () => {
    investRepo.count.mockResolvedValue(2);
    await expect(useCase.execute(USER_ID, SELF)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_BLOCKED',
      details: { blockers: [{ code: 'ACTIVE_INVESTMENTS' }] },
    });
    const where = investRepo.count.mock.calls[0][0].where;
    expect(where.statut._value).toEqual(
      expect.arrayContaining([
        InvestmentStatus.CONFIRME,
        InvestmentStatus.PAYE,
        InvestmentStatus.SIGNE,
        InvestmentStatus.PAIEMENT_ATTENDU,
        InvestmentStatus.REMBOURSE_CAPITAL,
      ]),
    );
  });

  it('bloque sur OPEN_ORDERS (vente OU achat, statuts ouverts)', async () => {
    ordreRepo.count.mockResolvedValue(1);
    await expect(useCase.execute(USER_ID, SELF)).rejects.toMatchObject({
      details: { blockers: [{ code: 'OPEN_ORDERS' }] },
    });
    const where = ordreRepo.count.mock.calls[0][0].where;
    expect(where).toHaveLength(2); // vendeur + acheteur
    expect(where[0].statut._value).toEqual(
      expect.arrayContaining([
        OrdreMarcheStatus.EN_CARNET,
        OrdreMarcheStatus.MATCH_PROPOSE,
        OrdreMarcheStatus.ACCEPTE,
      ]),
    );
  });

  it('solde > 0 SANS IBAN → WALLET_BALANCE(false) + NO_IBAN, aucun retrait, pas de transaction', async () => {
    walletRepo.findOne.mockResolvedValue({
      id: 'w1',
      solde: 150,
      devise: 'EUR',
    });
    txRepo.findOne.mockResolvedValue(null); // aucun IBAN historique

    await expect(useCase.execute(USER_ID, SELF)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_BLOCKED',
      details: {
        blockers: [
          { code: 'WALLET_BALANCE', withdrawalCreated: false },
          { code: 'NO_IBAN' },
        ],
      },
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('solde > 0 AVEC IBAN → retrait ATOMIQUE (tx + débit dans la même transaction) + 409 withdrawalCreated:true', async () => {
    givenBalanceWithIban(150);

    await expect(useCase.execute(USER_ID, SELF)).rejects.toMatchObject({
      details: {
        blockers: [{ code: 'WALLET_BALANCE', withdrawalCreated: true }],
      },
    });

    // Transaction utilisée ; wallet lu SOUS VERROU pessimiste.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    const lockCall = manager.findOne.mock.calls.find(
      (c: any) => c[0] === WalletEntity,
    );
    expect(lockCall[1].lock).toEqual({ mode: 'pessimistic_write' });

    // Tx RETRAIT créée avec clé d'idempotence DÉTERMINISTE + montant = solde verrouillé.
    const created = manager.create.mock.calls.find(
      (c: any) => c[0] === TransactionEntity,
    )[1];
    expect(created).toMatchObject({
      walletId: 'w1',
      type: TransactionType.RETRAIT,
      montant: 150,
      statut: TransactionStatus.EN_ATTENTE_PAIEMENT,
      fournisseurRef: 'FR7612345',
      idempotencyKey: `retrait:suppression:${USER_ID}`,
    });
    // Débit dans la MÊME transaction (wallet.solde → 0 via manager.save).
    const walletSave = manager.save.mock.calls.find(
      (c: any) => c[0] === WalletEntity,
    );
    expect(walletSave[1].solde).toBe(0);
    expect(notifications.pushToAdmins).toHaveBeenCalled();
    // Suppression jamais partielle : le compte n'est PAS marqué SUPPRIME.
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('retrait DÉJÀ en attente (vu sous verrou) → pas de doublon, withdrawalCreated:true, aucune écriture', async () => {
    givenBalanceWithIban(150);
    pendingTx = {
      id: 'pending',
      montant: 150,
      type: TransactionType.RETRAIT,
      statut: TransactionStatus.EN_ATTENTE_PAIEMENT,
    };

    await expect(useCase.execute(USER_ID, SELF)).rejects.toMatchObject({
      details: {
        blockers: [{ code: 'WALLET_BALANCE', withdrawalCreated: true }],
      },
    });
    expect(manager.save).not.toHaveBeenCalled(); // ni tx ni débit
    expect(notifications.pushToAdmins).not.toHaveBeenCalled();
  });

  it("deux DELETE concurrents : collision de clé d'idempotence (23505) → un seul retrait, withdrawalCreated:true", async () => {
    givenBalanceWithIban(150);
    // Le second appel gagne le verrou après le premier commit : la contrainte
    // unique sur la clé déterministe rejette son insertion.
    const dup = new QueryFailedError(
      'insert',
      undefined,
      new Error('duplicate key') as any,
    );
    (dup as any).code = '23505';
    dataSource.transaction.mockRejectedValue(dup);

    await expect(useCase.execute(USER_ID, SELF)).rejects.toMatchObject({
      details: {
        blockers: [{ code: 'WALLET_BALANCE', withdrawalCreated: true }],
      },
    });
    // Aucun second débit : l'alerte financière ne part que sur 'created'.
    expect(notifications.pushToAdmins).not.toHaveBeenCalled();
  });

  it("échec du débit dans la transaction → rollback (l'erreur remonte, compte NON supprimé)", async () => {
    givenBalanceWithIban(150);
    // La tx s'écrit puis le débit du wallet échoue : la transaction rejette
    // (erreur non-unique) → tout est annulé, l'erreur remonte.
    manager.save.mockImplementation(async (entity: any, obj: any) => {
      if (entity === WalletEntity) throw new Error('db down au débit');
      return { id: 'tx-new', ...obj };
    });

    await expect(useCase.execute(USER_ID, SELF)).rejects.toThrow(
      'db down au débit',
    );
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(notifications.pushToAdmins).not.toHaveBeenCalled();
  });

  // ── Combinaison ─────────────────────────────────────────────────────────────

  it('renvoie TOUS les bloqueurs ensemble (investissements + ordres + solde sans IBAN)', async () => {
    investRepo.count.mockResolvedValue(1);
    ordreRepo.count.mockResolvedValue(1);
    walletRepo.findOne.mockResolvedValue({
      id: 'w1',
      solde: 80,
      devise: 'EUR',
    });
    txRepo.findOne.mockResolvedValue(null);

    let caught: any;
    try {
      await useCase.execute(USER_ID, SELF);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AccountDeletionBlockedError);
    const codes = caught.details.blockers.map((b: any) => b.code);
    expect(codes).toEqual([
      'ACTIVE_INVESTMENTS',
      'OPEN_ORDERS',
      'WALLET_BALANCE',
      'NO_IBAN',
    ]);
  });

  // La forme plate du corps HTTP (`{ code, blockers }` à la racine, sans
  // `message`) est désormais vérifiée par iam-error.filter.spec.ts : c'est le
  // filtre qui la produit. Ici on ne vérifie que ce que le domaine expose.
  it("l'erreur porte le code et les blockers en données structurées", async () => {
    investRepo.count.mockResolvedValue(1);

    let caught: any;
    try {
      await useCase.execute(USER_ID, SELF);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AccountDeletionBlockedError);
    expect(caught.code).toBe('ACCOUNT_DELETION_BLOCKED');
    expect(caught.details.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ACTIVE_INVESTMENTS' }),
      ]),
    );
  });

  // ── Chemin heureux ──────────────────────────────────────────────────────────

  it('aucun bloqueur → SUPPRIME + email compte-supprime + notif in-app + event back-office', async () => {
    await useCase.execute(USER_ID, SELF);

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: UserStatus.SUPPRIME }),
    );
    expect(notifications.push).toHaveBeenCalledWith(
      expect.objectContaining({ utilisateurId: USER_ID }),
    );
    expect(templates.render).toHaveBeenCalledWith('compte-supprime', {
      prenom: 'Jean',
    });
    expect(emailService.sendTransactionalEmail).toHaveBeenCalledWith(
      'jean@example.com',
      'Compte supprimé',
      '<html></html>',
    );
    expect(notificationEvents.accountDeletedByUser).toHaveBeenCalled();
  });

  it('chemin heureux robuste si template désactivé (render → null) : suppression quand même', async () => {
    templates.render.mockResolvedValue(null);
    await useCase.execute(USER_ID, SELF);
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: UserStatus.SUPPRIME }),
    );
    expect(emailService.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  // ── Gardes admin ─────────────────────────────────────────────────────────────

  it('admin ne peut pas se supprimer lui-même → 400', async () => {
    await expect(
      useCase.execute(ADMIN.userId, {
        userId: ADMIN.userId,
        role: 'super_admin',
      }),
    ).rejects.toBeInstanceOf(AccountDeletionNotAllowedError);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it("interdit la suppression d'un compte détenant users:delete (autre super_admin) → 400", async () => {
    userRepo.findOne.mockResolvedValue({
      ...baseUser(),
      userId: 2,
      role: 'super_admin',
    });
    await expect(useCase.execute(2, ADMIN)).rejects.toBeInstanceOf(
      AccountDeletionNotAllowedError,
    );
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it("un utilisateur standard supprimant SON propre compte n'est pas bloqué par la garde admin", async () => {
    await useCase.execute(USER_ID, SELF);
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: UserStatus.SUPPRIME }),
    );
  });
});
