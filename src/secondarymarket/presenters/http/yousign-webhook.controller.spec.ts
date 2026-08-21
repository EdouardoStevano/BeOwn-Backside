import { YouSignWebhookController } from './yousign-webhook.controller';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';

/**
 * Régression sécurité (fix paiements) : la signature n'est marquée SIGNED
 * qu'APRÈS l'exécution atomique. Ces tests couvrent la branche souscription
 * initiale (ordreId = null) via un EntityManager simulé.
 */
describe('YouSignWebhookController.handleSignatureDone (atomicité SIGNED)', () => {
  const REQ_ID = 'ys-req-1';

  function makeChainableQb() {
    const qb: any = {};
    qb.select = () => qb;
    qb.where = () => qb;
    qb.andWhere = () => qb;
    qb.getRawOne = async () => ({ total: '0' });
    return qb;
  }

  /**
   * Fabrique le contrôleur + le store partagé. `lockedSignature` permet de
   * simuler une relecture SOUS VERROU qui diffère de la lecture pré-transaction
   * (livraison concurrente déjà committée).
   */
  function setup(opts: {
    solde: number;
    preTxSignature: Partial<SignatureEntity>;
    lockedSignature?: Partial<SignatureEntity>;
  }) {
    const signature: any = {
      id: 'sig-1',
      youSignRequestId: REQ_ID,
      statut: SignatureStatus.PENDING,
      ordreId: null,
      investmentId: 'inv-1',
      documentId: null,
      userId: 1,
      signedAt: null,
      ...opts.preTxSignature,
    };
    const lockedSignature: any =
      opts.lockedSignature === undefined
        ? signature
        : { ...signature, ...opts.lockedSignature };

    const investment: any = {
      id: 'inv-1',
      statut: InvestmentStatus.INITIE,
      montant: 100,
      utilisateurId: 1,
      projetId: 'proj-1',
      nbTitres: 1,
    };
    const wallet: any = {
      id: 'w-1',
      solde: opts.solde,
      devise: 'EUR',
      proprietaireUserId: 1,
      type: WalletType.INVESTISSEUR,
    };
    const project: any = {
      id: 'proj-1',
      triCible: 0,
      dureeMois: 12,
      ticketMinimum: 100,
      nbFractions: 10,
      capitalCible: 1000,
      titre: 'Projet Test',
    };

    const manager: any = {
      findOne: jest.fn(async (Entity: any) => {
        if (Entity === SignatureEntity) return lockedSignature;
        if (Entity === InvestmentEntity) return investment;
        if (Entity === ProjectEntity) return project;
        if (Entity === WalletEntity) return wallet;
        return null;
      }),
      save: jest.fn(async (_Entity: any, obj: any) => obj),
      create: jest.fn((_Entity: any, obj: any) => obj),
      update: jest.fn(async () => ({})),
      createQueryBuilder: jest.fn(() => makeChainableQb()),
    };

    const dataSource: any = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };

    const signatureRepo: any = { findOne: jest.fn(async () => signature), save: jest.fn() };
    const noopRepo: any = { findOne: jest.fn(), save: jest.fn(), update: jest.fn() };
    const youSignService: any = {
      downloadSignedDocument: jest.fn(async () => Buffer.from('pdf')),
    };
    const cloudStorage: any = {
      upload: jest.fn(async () => ({ objectName: 'o', publicUrl: 'u' })),
    };
    const notificationService: any = {
      push: jest.fn().mockResolvedValue(undefined),
      pushToAdmins: jest.fn().mockResolvedValue(undefined),
    };
    const notificationEvents: any = { investmentCreated: jest.fn() };
    const userRepository: any = { findById: jest.fn(async () => ({ userId: 1 })) };
    const platformFees: any = { getRates: jest.fn(), computeResaleFees: jest.fn() };

    const controller = new YouSignWebhookController(
      signatureRepo,
      noopRepo, // investRepo (unused: exécution via manager)
      noopRepo, // echeanceRepo
      noopRepo, // projectRepo
      noopRepo, // ordreRepo
      noopRepo, // documentRepo
      noopRepo, // walletRepo
      noopRepo, // txRepo
      dataSource,
      youSignService,
      notificationService,
      cloudStorage,
      userRepository,
      notificationEvents,
      platformFees,
    );

    return { controller, signature, lockedSignature, investment, wallet, dataSource, manager, notificationEvents };
  }

  it('laisse la signature PENDING quand l\'exécution échoue (rejouable), puis réussit au rejeu', async () => {
    // Solde insuffisant → executeInvestmentSignature lève avant tout write.
    const ctx = setup({ solde: 50, preTxSignature: {} });

    await expect(ctx.controller.handleSignatureDone(REQ_ID)).rejects.toThrow(
      /Solde insuffisant/,
    );

    // La signature n'a PAS été marquée SIGNED → un rejeu du webhook ré-exécute.
    expect(ctx.signature.statut).toBe(SignatureStatus.PENDING);
    expect(ctx.investment.statut).toBe(InvestmentStatus.INITIE);

    // Rejeu après approvisionnement du wallet : l'exécution aboutit.
    ctx.wallet.solde = 500;
    await ctx.controller.handleSignatureDone(REQ_ID);

    expect(ctx.investment.statut).toBe(InvestmentStatus.CONFIRME);
    expect(ctx.signature.statut).toBe(SignatureStatus.SIGNED);
    expect(ctx.signature.signedAt).toBeInstanceOf(Date);
    expect(ctx.notificationEvents.investmentCreated).toHaveBeenCalledTimes(1);
  });

  it('no-op si la signature est déjà traitée avant la transaction (livraison dupliquée)', async () => {
    const ctx = setup({
      solde: 500,
      preTxSignature: { statut: SignatureStatus.SIGNED },
    });

    await ctx.controller.handleSignatureDone(REQ_ID);

    // Aucune transaction ouverte, aucune exécution.
    expect(ctx.dataSource.transaction).not.toHaveBeenCalled();
    expect(ctx.investment.statut).toBe(InvestmentStatus.INITIE);
    expect(ctx.notificationEvents.investmentCreated).not.toHaveBeenCalled();
  });

  it('no-op sous verrou si une livraison concurrente a déjà finalisé la signature', async () => {
    // Pré-transaction : PENDING (course gagnée à la lecture) ; sous verrou :
    // SIGNED (l'autre livraison a committé entre-temps) → aucune exécution.
    const ctx = setup({
      solde: 500,
      preTxSignature: {},
      lockedSignature: { statut: SignatureStatus.SIGNED },
    });

    await ctx.controller.handleSignatureDone(REQ_ID);

    expect(ctx.dataSource.transaction).toHaveBeenCalledTimes(1);
    // La branche exécution n'est jamais atteinte : l'investissement reste INITIE.
    expect(ctx.investment.statut).toBe(InvestmentStatus.INITIE);
    expect(ctx.notificationEvents.investmentCreated).not.toHaveBeenCalled();
    // Le manager n'a interrogé QUE la signature (verrou), pas l'investissement.
    const queriedInvestment = ctx.manager.findOne.mock.calls.some(
      (c: any[]) => c[0] === InvestmentEntity,
    );
    expect(queriedInvestment).toBe(false);
  });
});
