import { PayEcheanceUseCase } from './pay-echeance.usecase';
import { EcheanceStatus } from '../../domains/enums/investment-status.enum';
import { EcheanceEntity } from '../../infrastructure/persistences/entities/echeance.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';

/**
 * Mock EntityManager reproduisant le comportement atomique attendu (correctif
 * H-C) : claim conditionnel de l'échéance + crédits SQL `solde + :amount`.
 * Capture les payloads `.set(...)` et les paramètres `amount` pour vérifier les
 * montants PFU sans base réelle.
 */
function createMockEm(
  echeance: any,
  wallets: any[], // ordre findOne(WalletEntity): investisseur, IR, CSG
  claimAffected = 1,
  // Portefeuille technique du projet — contrepartie DÉBITÉE du règlement.
  // Relu par `debitAtomic` avant le débit (détection de découvert), il est
  // donc le PREMIER `findOne(WalletEntity)` de la séquence.
  walletProjet: any = { id: 'wProjet', solde: 1_000_000, devise: 'EUR' },
) {
  const walletQueue = [walletProjet, ...wallets];
  const setPayloads: any[] = [];
  const amountParams: number[] = [];
  const savedTx: any[] = [];
  const createdWallets: any[] = [];
  let updateCount = 0;

  const makeQb = () => {
    const b: any = {
      update: () => b,
      set: (p: any) => {
        setPayloads.push(p);
        return b;
      },
      setParameter: (k: string, v: any) => {
        if (k === 'amount') amountParams.push(v);
        return b;
      },
      setParameters: () => b,
      where: () => b,
      andWhere: () => b,
      execute: async () => {
        updateCount += 1;
        // Le 1er update est le CLAIM de l'échéance ; les suivants sont des crédits.
        return { affected: updateCount === 1 ? claimAffected : 1 };
      },
    };
    return b;
  };

  const em: any = {
    findOne: jest.fn(async (entity: any) => {
      if (entity === EcheanceEntity) return echeance;
      if (entity === WalletEntity) return walletQueue.shift() ?? null;
      return null;
    }),
    createQueryBuilder: jest.fn(() => makeQb()),
    create: jest.fn((entity: any, obj: any) => {
      if (entity === WalletEntity) createdWallets.push(obj);
      return obj;
    }),
    save: jest.fn(async (entity: any, obj: any) => {
      if (entity === TransactionEntity) savedTx.push(obj);
      return obj ?? entity;
    }),
    _setPayloads: setPayloads,
    _amountParams: amountParams,
    _savedTx: savedTx,
    _createdWallets: createdWallets,
  };
  return em;
}

describe('PayEcheanceUseCase (atomique — H-C)', () => {
  let useCase: PayEcheanceUseCase;
  let dataSource: any;
  let notificationEvents: any;
  let auditLog: any;
  let em: any;
  let metrics: any;
  let projectWalletResolver: any;

  const makeUseCase = (
    mockEm: any,
    walletProjetId = 'wProjet',
  ) => {
    em = mockEm;
    dataSource = { transaction: jest.fn(async (cb: any) => cb(mockEm)) };
    notificationEvents = { echeancePaid: jest.fn().mockResolvedValue(undefined) };
    auditLog = { create: jest.fn().mockResolvedValue(undefined) };
    metrics = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };
    // Le résolveur est un double : sa propre idempotence sous verrou est
    // couverte par `resolve-project-wallet.usecase.spec.ts`. Ce qui se teste
    // ICI, c'est que le règlement DÉBITE bien la contrepartie qu'il rend.
    projectWalletResolver = {
      executeInTransaction: jest
        .fn()
        .mockResolvedValue({ id: walletProjetId, solde: 0, devise: 'EUR' }),
      findInTransaction: jest.fn(),
    };
    return new PayEcheanceUseCase(
      dataSource,
      notificationEvents,
      auditLog,
      metrics,
      projectWalletResolver,
    );
  };

  it('crédite le net (après PFU 30%), stocke les prélèvements et passe PAYE', async () => {
    const project = { id: 'p', titre: 'Résidence' };
    // montantTotal = 50000, montantInterets = 10000
    // IR = 1280, CSG = 1720, net = 47000
    const echeance: any = {
      id: 'e1',
      statut: EcheanceStatus.A_VENIR,
      montantTotal: 50000,
      montantInterets: 10000,
      investissementId: 'i1',
      investissement: { utilisateurId: 42, projet: project, projetId: 'p' },
    };
    em = createMockEm(echeance, [
      { id: 'w1', solde: 100000, devise: 'EUR' }, // investisseur
      { id: 'wIR', solde: 0, devise: 'EUR' },      // SEQUESTRE_IR existant
      { id: 'wCSG', solde: 0, devise: 'EUR' },     // SEQUESTRE_CSG existant
    ]);
    useCase = makeUseCase(em);

    const result = await useCase.execute('e1', 1);

    // 1. Claim conditionnel : statut PAYE + prélèvements dans le 1er .set()
    expect(em._setPayloads[0]).toEqual(
      expect.objectContaining({
        statut: EcheanceStatus.PAYE,
        prelevementIR: 1280,
        prelevementCSG: 1720,
      }),
    );
    // 2. Mouvements atomiques : DÉBIT du projet (brut) puis crédits
    //    investisseur net, IR, CSG. Le brut sort de la poche du projet — la
    //    retenue fiscale comprise, elle est seulement consignée ailleurs.
    expect(em._amountParams).toEqual([50000, 47000, 1280, 1720]);
    // 3. Trois traces ledger idempotency-keyées, TOUTES adossées au
    //    portefeuille du projet : « Σ crédits − Σ débits » se rapproche.
    const keys = em._savedTx.map((t: any) => t.idempotencyKey).sort();
    expect(keys).toEqual(['echeance:csg:e1', 'echeance:ir:e1', 'echeance:pay:e1']);
    expect(em._savedTx.map((t: any) => t.walletSource)).toEqual([
      'wProjet',
      'wProjet',
      'wProjet',
    ]);
    // Somme des crédits = montant débité : aucun euro créé ni détruit.
    const totalCredite = em._savedTx.reduce(
      (somme: number, t: any) => somme + Number(t.montant),
      0,
    );
    expect(totalCredite).toBe(50000);
    // 4. Entité renvoyée reflète l'état payé
    expect(result.statut).toBe(EcheanceStatus.PAYE);
    expect(result.prelevementIR).toBe(1280);
    expect(result.prelevementCSG).toBe(1720);
    // 5. Effets de bord après commit
    expect(notificationEvents.echeancePaid).toHaveBeenCalledWith(echeance, project);
    expect(auditLog.create).toHaveBeenCalledWith(
      '1',
      UserRole.SUPER_ADMIN,
      'echeance.pay',
      'echeance',
      'e1',
      undefined,
      undefined,
      expect.any(Object),
    );
  });

  it('crée les wallets séquestres IR/CSG quand ils n\'existent pas encore', async () => {
    const project = { id: 'p2', titre: 'Test' };
    const echeance: any = {
      id: 'e2',
      statut: EcheanceStatus.A_VENIR,
      montantTotal: 10000,
      montantInterets: 2000,
      investissementId: 'i2',
      investissement: { utilisateurId: 7, projet: project, projetId: 'p2' },
    };
    em = createMockEm(echeance, [
      { id: 'wInv', solde: 0, devise: 'EUR' }, // investisseur
      null, // SEQUESTRE_IR absent → création
      null, // SEQUESTRE_CSG absent → création
    ]);
    useCase = makeUseCase(em);

    await useCase.execute('e2', 1);

    expect(em._createdWallets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fournisseurRef: 'SEQUESTRE-IR' }),
        expect.objectContaining({ fournisseurRef: 'SEQUESTRE-CSG' }),
      ]),
    );
  });

  it('règle quand même l\'échéance sur un projet non alimenté, et signale le découvert', async () => {
    // Le porteur n'a pas alimenté son projet. Le règlement reste dû aux
    // investisseurs : on paie, et le trou devient visible immédiatement —
    // plutôt que d'inventer des euros ou de transformer le défaut du porteur
    // en impayé pour l'investisseur.
    const echeance: any = {
      id: 'e5',
      statut: EcheanceStatus.A_VENIR,
      montantTotal: 10000,
      montantInterets: 0,
      investissementId: 'i5',
      investissement: { utilisateurId: 11, projet: { id: 'p5' }, projetId: 'p5' },
    };
    em = createMockEm(
      echeance,
      [
        { id: 'wInv5', solde: 0, devise: 'EUR' },
        { id: 'wIR', solde: 0, devise: 'EUR' },
        { id: 'wCSG', solde: 0, devise: 'EUR' },
      ],
      1,
      { id: 'wProjet', solde: 2500, devise: 'EUR' }, // insuffisant : 2 500 < 10 000
    );
    useCase = makeUseCase(em);

    await useCase.execute('e5', 1);

    // Le débit a bien eu lieu, à hauteur du brut.
    expect(em._amountParams[0]).toBe(10000);
    // Et le découvert (10 000 − 2 500) est remonté sans attendre le
    // rapprochement quotidien.
    expect(metrics.setGauge).toHaveBeenCalledWith(
      'beown_project_wallet_shortfall_eur',
      7500,
    );
  });

  it('rejette si l\'échéance est déjà PAYE (statut non payable)', async () => {
    em = createMockEm({ id: 'e1', statut: EcheanceStatus.PAYE }, []);
    useCase = makeUseCase(em);
    await expect(useCase.execute('e1', 1)).rejects.toThrow();
  });

  it('rejette (sans créditer) si le CLAIM concurrent échoue (affected=0)', async () => {
    const echeance: any = {
      id: 'e4',
      statut: EcheanceStatus.A_VENIR,
      montantTotal: 20000,
      montantInterets: 4000,
      investissementId: 'i4',
      investissement: { utilisateurId: 9, projet: { id: 'p4' }, projetId: 'p4' },
    };
    em = createMockEm(
      echeance,
      [{ id: 'wInv4', solde: 0, devise: 'EUR' }],
      0, // claim affecte 0 ligne → un run concurrent a déjà payé
    );
    useCase = makeUseCase(em);
    await expect(useCase.execute('e4', 1)).rejects.toThrow();
    // Aucun crédit ne doit avoir eu lieu
    expect(em._amountParams).toEqual([]);
    expect(em._savedTx).toEqual([]);
  });

  it('audite avec le rôle réel de l\'acteur quand adminRole est fourni', async () => {
    const project = { id: 'p3', titre: 'Cottage' };
    const echeance: any = {
      id: 'e3',
      statut: EcheanceStatus.A_VENIR,
      montantTotal: 20000,
      montantInterets: 4000,
      investissementId: 'i3',
      investissement: { utilisateurId: 9, projet: project, projetId: 'p3' },
    };
    em = createMockEm(echeance, [
      { id: 'wInv3', solde: 0, devise: 'EUR' },
      { id: 'wIR3', solde: 0, devise: 'EUR' },
      { id: 'wCSG3', solde: 0, devise: 'EUR' },
    ]);
    useCase = makeUseCase(em);

    await useCase.execute('e3', 1, UserRole.CIO);

    expect(auditLog.create).toHaveBeenCalledWith(
      '1',
      UserRole.CIO,
      'echeance.pay',
      'echeance',
      'e3',
      undefined,
      undefined,
      expect.any(Object),
    );
  });
});
