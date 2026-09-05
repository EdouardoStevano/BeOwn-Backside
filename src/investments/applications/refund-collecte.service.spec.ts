import { RefundCollecteService } from './refund-collecte.service';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { TransactionType } from 'src/wallets/domains/enums/wallet.enum';
import {
  mouvementsDepuisInstantanes,
  variationTotale,
  PositionWallet,
} from 'src/wallets/domains/grand-livre';

/**
 * GRAND LIVRE — remboursement intégral d'une collecte échouée.
 *
 * Deux investisseurs, deux chemins de fonds distincts :
 *  • u1 (CONFIRME, 400 €) : ses fonds avaient été crédités au wallet projet à
 *    la souscription — ils en repartent vers lui (projet → investisseur) ;
 *  • u2 (EN_DELAI_RETRACTATION, 200 €) : ses fonds n'avaient jamais quitté son
 *    wallet (poche bloquée) — le remboursement est un déblocage interne.
 *
 * Le harnais interprète les UPDATE SQL sur un état en mémoire et prouve, par
 * instantanés avant/après sur TOUS les wallets, que la somme des variations
 * vaut exactement zéro.
 */
describe('RefundCollecteService — invariant comptable (scénario : remboursement de collecte échouée)', () => {
  const PROJECT_ID = 'p1';

  let projectRow: any;
  let investments: any[];
  let walletU1: any;
  let walletU2: any;
  let projectWalletRow: any;
  let savedTxs: any[];
  let manager: any;
  let service: RefundCollecteService;

  const snapshotWallets = (): Map<string, PositionWallet> =>
    new Map(
      [walletU1, walletU2, projectWalletRow].map((w: any) => [
        w.id,
        { solde: Number(w.solde), soldeBloque: Number(w.soldeBloque ?? 0) },
      ]),
    );

  /** Applique un `set` TypeORM (expressions SQL simulées) au wallet visé. */
  const applySet = (wallet: any, set: any, amount: number) => {
    if (typeof set.solde === 'function') {
      const expr: string = set.solde();
      wallet.solde =
        Number(wallet.solde) + (expr.includes('-') ? -amount : amount);
    }
    if (typeof set.soldeBloque === 'function') {
      wallet.soldeBloque = Math.max(0, Number(wallet.soldeBloque) - amount);
    }
  };

  beforeEach(() => {
    projectRow = {
      id: PROJECT_ID,
      titre: 'Résidence Test',
      slug: 'residence-test',
      statut: 'en_collecte',
    };
    investments = [
      {
        id: 'inv-u1',
        utilisateurId: 1,
        projetId: PROJECT_ID,
        montant: 400,
        statut: InvestmentStatus.CONFIRME,
      },
      {
        id: 'inv-u2',
        utilisateurId: 2,
        projetId: PROJECT_ID,
        montant: 200,
        statut: InvestmentStatus.EN_DELAI_RETRACTATION,
      },
    ];
    // 400 € confirmés vivent sur le wallet projet ; les 200 € de u2 sont
    // encore bloqués sur son propre wallet (art. 22).
    walletU1 = { id: 'w-u1', proprietaireUserId: 1, solde: 100, soldeBloque: 0, devise: 'EUR' };
    walletU2 = { id: 'w-u2', proprietaireUserId: 2, solde: 0, soldeBloque: 200, devise: 'EUR' };
    projectWalletRow = { id: 'wp1', projetId: PROJECT_ID, solde: 400, soldeBloque: 0, devise: 'EUR' };
    savedTxs = [];

    const buildQB = () => {
      const qb: any = {
        _set: null,
        _params: {} as Record<string, unknown>,
        update() {
          return qb;
        },
        set(payload: any) {
          qb._set = payload;
          return qb;
        },
        setParameter(key: string, value: unknown) {
          qb._params[key] = value;
          return qb;
        },
        where(_clause: string, params?: Record<string, unknown>) {
          Object.assign(qb._params, params ?? {});
          return qb;
        },
        async execute() {
          const id = qb._params.id as string;
          const amount = Number(qb._params.amount);
          const wallet = [walletU1, walletU2, projectWalletRow].find(
            (w) => w.id === id,
          );
          if (!wallet) return { affected: 0 };
          // La clause `solde >= :amount` du débit projet est APPLIQUÉE ici :
          // sans elle, ce dépôt simulé accepterait un découvert que la base
          // refuse, et le test ne prouverait rien.
          const estDebit =
            typeof qb._set?.solde === 'function' &&
            String(qb._set.solde()).includes('-');
          if (estDebit && Number(wallet.solde) < amount) {
            return { affected: 0 };
          }
          applySet(wallet, qb._set, amount);
          return { affected: 1 };
        },
      };
      return qb;
    };

    manager = {
      findOne: jest.fn(async (entity: any, options: any) => {
        if (entity === ProjectEntity) return projectRow;
        if (entity === WalletEntity) {
          const userId = options?.where?.proprietaireUserId;
          return [walletU1, walletU2].find(
            (w) => w.proprietaireUserId === userId,
          );
        }
        return null;
      }),
      find: jest.fn(async (entity: any) =>
        entity === InvestmentEntity ? investments : [],
      ),
      createQueryBuilder: jest.fn(() => buildQB()),
      create: jest.fn((_entity: any, obj: any) => obj),
      save: jest.fn(async (obj: any) => {
        savedTxs.push(obj);
        return obj;
      }),
      update: jest.fn(async (entity: any, criteria: any, payload: any) => {
        if (entity === InvestmentEntity) {
          const inv = investments.find((i) => i.id === criteria.id);
          if (inv) inv.statut = payload.statut;
        }
        if (entity === ProjectEntity) projectRow.statut = payload.statut;
        if (entity === EcheanceEntity) {
          // Annulation d'échéances : sans effet sur les wallets.
        }
        return { affected: 1 };
      }),
    };

    const dataSource: any = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };
    const notifications: any = { push: jest.fn().mockResolvedValue(undefined) };
    const metrics: any = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };
    const projectWalletResolver: any = {
      executeInTransaction: jest.fn(async () => projectWalletRow),
      findInTransaction: jest.fn(async () => projectWalletRow),
    };

    service = new RefundCollecteService(
      dataSource,
      notifications,
      metrics,
      projectWalletResolver,
    );
  });

  it('remboursement de collecte échouée : Σ des variations de solde de TOUS les wallets = 0', async () => {
    const avant = snapshotWallets();

    const result = await service.refundProjectCollecte(PROJECT_ID, {
      targetStatus: 'echec',
      reason: 'Objectif minimum non atteint',
    });

    const apres = snapshotWallets();
    const mouvements = mouvementsDepuisInstantanes(avant, apres);

    // ── INVARIANT COMPTABLE : la somme des variations vaut exactement 0. ────
    expect(variationTotale(mouvements)).toBe(0);

    // Chemin CONFIRME : le wallet projet rend 400 € à u1.
    expect(projectWalletRow.solde).toBe(0);
    expect(walletU1.solde).toBe(500);
    // Chemin EN DÉLAI : déblocage interne de u2, 200 € bloqués → disponibles.
    expect(walletU2.solde).toBe(200);
    expect(walletU2.soldeBloque).toBe(0);

    expect(result).toEqual({ refundedCount: 2, refundedAmount: 600 });
    expect(investments.every((i) => i.statut === InvestmentStatus.ANNULE)).toBe(true);
    expect(projectRow.statut).toBe('echec');
  });

  it('les écritures ledger portent la double entrée et une clé d’idempotence par investissement', async () => {
    await service.refundProjectCollecte(PROJECT_ID, {
      targetStatus: 'echec',
      reason: null,
    });

    const txs = savedTxs.filter(
      (t) => t.type === TransactionType.REMBOURSEMENT_COLLECTE_ECHEC,
    );
    expect(txs).toHaveLength(2);

    const txU1 = txs.find((t) => t.walletDestination === 'w-u1');
    const txU2 = txs.find((t) => t.walletDestination === 'w-u2');
    // Fonds confirmés : ils reviennent DU wallet projet.
    expect(txU1.walletSource).toBe('wp1');
    expect(txU1.idempotencyKey).toBe('refund-collecte:inv-u1');
    // Fonds sous délai : mouvement interne au wallet de l'investisseur.
    expect(txU2.walletSource).toBe('w-u2');
    expect(txU2.idempotencyKey).toBe('refund-collecte:inv-u2');
  });

  it('projet déjà dans le statut cible : aucun remboursement, aucun mouvement (idempotence)', async () => {
    projectRow.statut = 'echec';
    const avant = snapshotWallets();

    const result = await service.refundProjectCollecte(PROJECT_ID, {
      targetStatus: 'echec',
    });

    expect(result).toEqual({ refundedCount: 0, refundedAmount: 0 });
    expect(mouvementsDepuisInstantanes(avant, snapshotWallets())).toHaveLength(0);
    expect(savedTxs).toHaveLength(0);
  });

  /**
   * Le débit du portefeuille de projet était INCONDITIONNEL : il passait
   * toujours, et un simple `warn` signalait après coup que le solde était
   * devenu négatif. Un remboursement de collecte porte sur des dizaines
   * d'engagements — le découvert se creusait silencieusement à chaque tour de
   * boucle, et l'avertissement ne bloquait rien.
   */
  describe('portefeuille de projet insuffisant', () => {
    it('interrompt le remboursement au lieu de creuser un découvert', async () => {
      // 100 € au projet pour 100 € dus à u1 puis... rien pour la suite.
      projectWalletRow.solde = 50;

      await expect(
        service.refundProjectCollecte(PROJECT_ID, { targetStatus: 'echec' }),
      ).rejects.toMatchObject({ code: 'SOLDE_PROJET_INSUFFISANT' });
    });

    it('le portefeuille du projet ne passe JAMAIS en négatif', async () => {
      projectWalletRow.solde = 50;

      await service
        .refundProjectCollecte(PROJECT_ID, { targetStatus: 'echec' })
        .catch(() => undefined);

      expect(Number(projectWalletRow.solde)).toBeGreaterThanOrEqual(0);
    });

    it("l'erreur porte le projet, le portefeuille et le montant dû", async () => {
      projectWalletRow.solde = 0;

      const erreur = await service
        .refundProjectCollecte(PROJECT_ID, { targetStatus: 'echec' })
        .catch((e) => e);

      expect(erreur).toMatchObject({
        projetId: PROJECT_ID,
        walletId: 'wp1',
        montantRequis: 400,
      });
    });

    it('CONTRE-ÉPREUVE : solde suffisant → remboursement complet', async () => {
      projectWalletRow.solde = 400;

      await expect(
        service.refundProjectCollecte(PROJECT_ID, { targetStatus: 'echec' }),
      ).resolves.toMatchObject({ refundedCount: 2 });
    });
  });
});
