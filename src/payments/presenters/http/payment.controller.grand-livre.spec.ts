import { PaymentController } from './payment.controller';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  EcritureGrandLivre,
  PositionWallet,
  grandLivreRapproche,
  rapprocherGrandLivre,
} from 'src/wallets/domains/grand-livre';
import { TransactionType } from 'src/wallets/domains/enums/wallet.enum';

/**
 * INVARIANT COMPTABLE DU DÉPÔT — non-régression d'ANO-02.
 *
 * La campagne du 2026-08-30 a mesuré 150,00 € d'écart sur le portefeuille d'un
 * investisseur après trois dépôts de 50 € : le solde était juste, le grand
 * livre à l'envers (le bénéficiaire inscrit côté `wallet_source`, colonne
 * doublon, et `walletDestination` laissé à NULL). Aucun test ne rapprochait
 * « Σ crédits − Σ débits » du solde réel : le défaut était invisible.
 *
 * Ce test ferme le trou. Il ne mime pas l'écriture : il exécute le VRAI chemin
 * de crédit (`confirmDepot` → `creditDepositAtomic`) contre un EntityManager
 * qui persiste réellement l'écriture et applique réellement l'incrément de
 * solde, puis rapproche les deux. Écrire le dépôt du mauvais côté fait
 * échouer le rapprochement — c'est vérifié explicitement en fin de fichier.
 */
describe('PaymentController — le dépôt se rapproche du grand livre (ANO-02)', () => {
  const USER_ID = 42;
  const WALLET_ID = 'ed31f4b3-0000-0000-0000-000000000008';

  let controller: PaymentController;
  let stripeService: any;
  let walletRepo: any;
  let dataSource: any;

  /** Base en mémoire : les positions réelles et le registre, séparés. */
  let soldes: Map<string, { solde: number; soldeBloque: number }>;
  let ledger: EcritureGrandLivre[];

  const user = { userId: USER_ID, email: 'i1@beown.test', role: 'INVESTISSEUR' } as any;

  const positionsReelles = (): ReadonlyMap<string, PositionWallet> =>
    new Map(soldes);

  /**
   * EntityManager minimal mais HONNÊTE : l'insert range l'écriture dans le
   * registre, l'update applique le delta au solde. C'est ce qui permet au
   * rapprochement de dire quelque chose.
   */
  const entityManager = () => {
    const em: any = {
      // Le portefeuille est désormais résolu DANS la transaction (création
      // sous verrou) : le manager doit donc savoir le rendre.
      findOne: jest.fn(async () => ({ id: WALLET_ID, solde: 0, devise: 'EUR' })),
      create: jest.fn((_e: any, o: any) => o),
      save: jest.fn(async (o: any) => ({ id: WALLET_ID, ...o })),
      insert: jest.fn(async (entity: any, valeurs: any) => {
        if (entity !== TransactionEntity) return;
        ledger.push({
          walletSource: valeurs.walletSource ?? null,
          walletDestination: valeurs.walletDestination ?? null,
          montant: valeurs.montant,
        });
      }),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {};
        let cible: string | null = null;
        let montant = 0;
        qb.update = jest.fn(() => qb);
        qb.set = jest.fn(() => qb);
        qb.setParameter = jest.fn((_nom: string, valeur: number) => {
          montant = Number(valeur);
          return qb;
        });
        qb.where = jest.fn((_clause: string, params: any) => {
          cible = params?.id ?? null;
          return qb;
        });
        qb.execute = jest.fn(async () => {
          const position = cible ? soldes.get(cible) : undefined;
          if (position) position.solde += montant;
          return { affected: position ? 1 : 0 };
        });
        return qb;
      }),
    };
    return em;
  };

  const deposer = async (paymentIntentId: string, montantEuros: number) => {
    stripeService.retrievePaymentIntent.mockResolvedValue({
      status: 'succeeded',
      amount: Math.round(montantEuros * 100),
      currency: 'eur',
      metadata: { userId: String(USER_ID) },
    });
    return controller.confirmDepot({ paymentIntentId } as any, user);
  };

  beforeEach(() => {
    soldes = new Map([[WALLET_ID, { solde: 0, soldeBloque: 0 }]]);
    ledger = [];

    stripeService = {
      retrievePaymentIntent: jest.fn(),
      constructWebhookEvent: jest.fn(),
    };
    walletRepo = {
      findOne: jest.fn().mockResolvedValue({ id: WALLET_ID, devise: 'EUR' }),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ id: WALLET_ID, ...x })),
    };
    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(entityManager())),
    };

    controller = new PaymentController(
      stripeService,
      /* identityService */ {} as any,
      /* stripeConnect */ {} as any,
      /* updateKycStatus */ {} as any,
      /* notificationService */ {
        push: jest.fn().mockResolvedValue(undefined),
        pushToAdmins: jest.fn().mockResolvedValue(undefined),
      } as any,
      /* auditLog */ {} as any,
      /* config */ { get: jest.fn() } as any,
      /* profilRepository */ {} as any,
      walletRepo,
      /* txRepo */ { findOne: jest.fn(), create: jest.fn(), save: jest.fn() } as any,
      /* projectRepo */ { findOne: jest.fn().mockResolvedValue(null) } as any,
      dataSource,
      /* requestRetrait */ {} as any,
      /* crediterApportPorteur */ { execute: jest.fn() } as any,
      /* metrics */ {
        incrementCounter: jest.fn(),
        observeHistogram: jest.fn(),
        setGauge: jest.fn(),
      } as any,
      /* transactionalEmails */ {
        depotConfirme: jest.fn().mockResolvedValue(undefined),
        retraitExecute: jest.fn().mockResolvedValue(undefined),
        kycValide: jest.fn().mockResolvedValue(undefined),
        kycRefuse: jest.fn().mockResolvedValue(undefined),
      } as any,
      /* amlMonitor */ { check: jest.fn().mockResolvedValue(undefined) } as any,
      /* retraitSettlement */ {} as any,
      /* gelDesAvoirs */ { assertAvoirsNonGeles: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  it("inscrit le dépôt du CÔTÉ CRÉDIT : walletDestination renseigné, walletSource NULL", async () => {
    await deposer('pi_1', 50);

    expect(ledger).toEqual([
      { walletSource: null, walletDestination: WALLET_ID, montant: 50 },
    ]);
  });

  it('le type DEPOT est bien celui écrit au registre', async () => {
    const em = entityManager();
    dataSource.transaction.mockImplementation(async (cb: any) => cb(em));

    await deposer('pi_type', 50);

    expect(em.insert).toHaveBeenCalledWith(
      TransactionEntity,
      expect.objectContaining({
        walletDestination: WALLET_ID,
        type: TransactionType.DEPOT,
      }),
    );
  });

  it('trois dépôts de 50 € : Σ crédits − Σ débits = solde, écart NUL', async () => {
    // Scénario exact de la campagne (spec K3), qui produisait 150 € d'écart.
    await deposer('pi_1', 50);
    await deposer('pi_2', 50);
    await deposer('pi_3', 50);

    expect(soldes.get(WALLET_ID)!.solde).toBe(150);
    expect(rapprocherGrandLivre(positionsReelles(), ledger)).toEqual([]);
    expect(grandLivreRapproche(positionsReelles(), ledger)).toBe(true);
  });

  it("un dépôt sur un solde déjà alimenté reste rapproché (dépôt initial du seed + dépôts carte)", async () => {
    // Position d'ouverture : un dépôt déjà au registre, du bon côté.
    soldes.set(WALLET_ID, { solde: 310000, soldeBloque: 0 });
    ledger.push({
      walletSource: null,
      walletDestination: WALLET_ID,
      montant: 310000,
    });

    await deposer('pi_1', 50);

    expect(soldes.get(WALLET_ID)!.solde).toBe(310050);
    expect(rapprocherGrandLivre(positionsReelles(), ledger)).toEqual([]);
  });

  it("un dépôt déjà traité (23505) ne touche ni le solde ni le registre", async () => {
    await deposer('pi_1', 50);

    dataSource.transaction.mockImplementation(async () => {
      throw { code: '23505' };
    });
    const res = await deposer('pi_1', 50);

    expect(res).toEqual({ success: true, alreadyProcessed: true });
    expect(soldes.get(WALLET_ID)!.solde).toBe(50);
    expect(ledger).toHaveLength(1);
    expect(rapprocherGrandLivre(positionsReelles(), ledger)).toEqual([]);
  });

  it('CONTRÔLE NÉGATIF — inscrire le dépôt côté source ferait ÉCHOUER ce test', () => {
    // Reproduction fidèle de l'écriture fautive : le bénéficiaire posé du côté
    // débiteur, la destination laissée à NULL. Le solde est le même ; le
    // rapprochement, lui, diverge du double du montant.
    const registreFautif: EcritureGrandLivre[] = [
      { walletSource: WALLET_ID, walletDestination: null, montant: 50 },
      { walletSource: WALLET_ID, walletDestination: null, montant: 50 },
      { walletSource: WALLET_ID, walletDestination: null, montant: 50 },
    ];
    const reelles = new Map([[WALLET_ID, { solde: 150, soldeBloque: 0 }]]);

    expect(grandLivreRapproche(reelles, registreFautif)).toBe(false);
    expect(rapprocherGrandLivre(reelles, registreFautif)).toEqual([
      {
        walletId: WALLET_ID,
        fondsDetenus: 150,
        grandLivre: -150,
        ecart: 300,
      },
    ]);
  });
});
