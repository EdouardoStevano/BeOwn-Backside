import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DeleteAccountUseCase } from './delete-account.usecase';
import { UserStatus } from 'src/users/infrastructure/persistences/entities/user.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { TransactionStatus, TransactionType } from 'src/wallets/domains/enums/wallet.enum';

/**
 * Chaque bloqueur est isolé puis combiné. Les repos sont mockés — on vérifie
 * la LOGIQUE de décision (quels statuts bloquent, quand le retrait auto part,
 * la garde anti-doublon, le chemin heureux) et la forme du 409.
 */
describe('DeleteAccountUseCase', () => {
  let useCase: DeleteAccountUseCase;
  let userRepo: any;
  let investRepo: any;
  let ordreRepo: any;
  let walletRepo: any;
  let txRepo: any;
  let notifications: any;
  let notificationEvents: any;
  let templates: any;
  let emailService: any;

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
    userRepo = {
      findOne: jest.fn().mockResolvedValue(baseUser()),
      save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
    };
    investRepo = { count: jest.fn().mockResolvedValue(0) };
    ordreRepo = { count: jest.fn().mockResolvedValue(0) };
    walletRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      decrement: jest.fn().mockResolvedValue(undefined),
    };
    txRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((tx) => tx),
      save: jest.fn().mockImplementation((tx) => Promise.resolve({ id: 'tx-1', ...tx })),
    };
    notifications = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue([]),
    };
    notificationEvents = { accountDeletedByUser: jest.fn().mockResolvedValue(undefined) };
    templates = {
      render: jest.fn().mockResolvedValue({ sujet: 'Compte supprimé', html: '<html></html>' }),
    };
    emailService = { sendTransactionalEmail: jest.fn().mockResolvedValue(undefined) };

    useCase = new DeleteAccountUseCase(
      userRepo,
      investRepo,
      ordreRepo,
      walletRepo,
      txRepo,
      notifications,
      notificationEvents,
      templates,
      emailService,
    );
  });

  // ── Introuvable ────────────────────────────────────────────────────────────

  it('lève 404 si utilisateur introuvable', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(useCase.execute(USER_ID, SELF)).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── Bloqueurs isolés ───────────────────────────────────────────────────────

  it('bloque sur ACTIVE_INVESTMENTS', async () => {
    investRepo.count.mockResolvedValue(2);
    await expect(useCase.execute(USER_ID, SELF)).rejects.toMatchObject({
      response: {
        code: 'ACCOUNT_DELETION_BLOCKED',
        blockers: [{ code: 'ACTIVE_INVESTMENTS' }],
      },
    });
    // Le count utilise bien les statuts bloquants (position engagée)
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
      response: { blockers: [{ code: 'OPEN_ORDERS' }] },
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

  it('solde > 0 SANS IBAN → WALLET_BALANCE(false) + NO_IBAN, aucun retrait créé', async () => {
    walletRepo.findOne.mockResolvedValue({ id: 'w1', solde: 150, devise: 'EUR' });
    txRepo.findOne.mockResolvedValue(null); // pas de retrait en attente, pas d'IBAN historique

    await expect(useCase.execute(USER_ID, SELF)).rejects.toMatchObject({
      response: {
        code: 'ACCOUNT_DELETION_BLOCKED',
        blockers: [
          { code: 'WALLET_BALANCE', withdrawalCreated: false },
          { code: 'NO_IBAN' },
        ],
      },
    });
    expect(txRepo.save).not.toHaveBeenCalled();
    expect(walletRepo.decrement).not.toHaveBeenCalled();
  });

  it('solde > 0 AVEC IBAN → crée le retrait total + 409 WALLET_BALANCE withdrawalCreated:true', async () => {
    walletRepo.findOne.mockResolvedValue({ id: 'w1', solde: 150, devise: 'EUR' });
    // 1er findOne (retrait en attente) → null ; 2e findOne (dernier retrait pour IBAN) → une tx avec IBAN
    txRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'old',
        type: TransactionType.RETRAIT,
        fournisseurRef: 'FR7612345',
        metadata: { ibanDestination: 'FR7612345' },
      });

    await expect(useCase.execute(USER_ID, SELF)).rejects.toMatchObject({
      response: {
        blockers: [{ code: 'WALLET_BALANCE', withdrawalCreated: true }],
      },
    });

    expect(txRepo.save).toHaveBeenCalledTimes(1);
    const saved = txRepo.create.mock.calls[0][0];
    expect(saved).toMatchObject({
      walletId: 'w1',
      type: TransactionType.RETRAIT,
      montant: 150,
      statut: TransactionStatus.EN_ATTENTE_PAIEMENT,
      fournisseurRef: 'FR7612345',
    });
    expect(walletRepo.decrement).toHaveBeenCalledWith({ id: 'w1' }, 'solde', 150);
    expect(notifications.pushToAdmins).toHaveBeenCalled();
    // Suppression jamais partielle : le compte n'est PAS marqué SUPPRIME
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('solde > 0 avec retrait DÉJÀ en attente → pas de doublon, WALLET_BALANCE withdrawalCreated:true', async () => {
    walletRepo.findOne.mockResolvedValue({ id: 'w1', solde: 150, devise: 'EUR' });
    txRepo.findOne.mockResolvedValueOnce({
      id: 'pending',
      type: TransactionType.RETRAIT,
      statut: TransactionStatus.EN_ATTENTE_PAIEMENT,
    });

    await expect(useCase.execute(USER_ID, SELF)).rejects.toMatchObject({
      response: {
        blockers: [{ code: 'WALLET_BALANCE', withdrawalCreated: true }],
      },
    });
    expect(txRepo.save).not.toHaveBeenCalled();
    expect(walletRepo.decrement).not.toHaveBeenCalled();
  });

  // ── Combinaison ─────────────────────────────────────────────────────────────

  it('renvoie TOUS les bloqueurs ensemble (investissements + ordres + solde sans IBAN)', async () => {
    investRepo.count.mockResolvedValue(1);
    ordreRepo.count.mockResolvedValue(1);
    walletRepo.findOne.mockResolvedValue({ id: 'w1', solde: 80, devise: 'EUR' });
    txRepo.findOne.mockResolvedValue(null);

    let caught: any;
    try {
      await useCase.execute(USER_ID, SELF);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    const codes = caught.response.blockers.map((b: any) => b.code);
    expect(codes).toEqual([
      'ACTIVE_INVESTMENTS',
      'OPEN_ORDERS',
      'WALLET_BALANCE',
      'NO_IBAN',
    ]);
  });

  it('le corps du 409 expose code et blockers À LA RACINE (forme plate, contrat figé)', async () => {
    investRepo.count.mockResolvedValue(1);

    let caught: any;
    try {
      await useCase.execute(USER_ID, SELF);
    } catch (e) {
      caught = e;
    }
    // NestJS sérialise getResponse() tel quel dans le body HTTP (response.data)
    const body = caught.getResponse();
    expect(body).toEqual({
      code: 'ACCOUNT_DELETION_BLOCKED',
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'ACTIVE_INVESTMENTS' }),
      ]),
    });
    // Pas d'imbrication message.blockers : les fronts parsent la racine d'abord
    expect(body.message).toBeUndefined();
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
    expect(templates.render).toHaveBeenCalledWith('compte-supprime', { prenom: 'Jean' });
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

  // ── Garde admin ─────────────────────────────────────────────────────────────

  it('admin ne peut pas se supprimer lui-même → 400', async () => {
    await expect(
      useCase.execute(ADMIN.userId, { userId: ADMIN.userId, role: 'super_admin' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('un utilisateur standard supprimant SON propre compte n\'est pas bloqué par la garde admin', async () => {
    // Même userId initiateur == cible mais rôle sans users:delete → chemin normal
    await useCase.execute(USER_ID, SELF);
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: UserStatus.SUPPRIME }),
    );
  });
});
