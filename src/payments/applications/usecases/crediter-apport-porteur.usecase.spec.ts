import { CrediterApportPorteurUseCase } from './crediter-apport-porteur.usecase';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';

const WALLET_PROJET = { id: 'w-projet', solde: 1000, devise: 'EUR' };

/** Violation d'unicité Postgres, telle que la remonte le driver `pg`. */
const violationUnicite = () => Object.assign(new Error('duplicate key'), { code: '23505' });

function createHarness(options: { insertJette?: Error } = {}) {
  const inserts: any[] = [];
  const credits: { walletId: string; montant: number }[] = [];
  let dernierWhere: any = null;

  const manager: any = {
    insert: jest.fn(async (_entity: any, payload: any) => {
      if (options.insertJette) throw options.insertJette;
      inserts.push(payload);
    }),
    createQueryBuilder: jest.fn(() => {
      let montant = 0;
      const qb: any = {
        update: () => qb,
        set: () => qb,
        setParameter: (cle: string, valeur: any) => {
          if (cle === 'montant') montant = valeur;
          return qb;
        },
        where: (_clause: string, params: any) => {
          dernierWhere = params;
          return qb;
        },
        execute: async () => {
          credits.push({ walletId: dernierWhere?.id, montant });
          return { affected: 1 };
        },
      };
      return qb;
    }),
  };

  const dataSource: any = {
    transaction: jest.fn(async (cb: any) => cb(manager)),
    manager: {},
  };

  const resolver: any = {
    executeInTransaction: jest.fn().mockResolvedValue(WALLET_PROJET),
    findInTransaction: jest.fn().mockResolvedValue(WALLET_PROJET),
  };

  return {
    useCase: new CrediterApportPorteurUseCase(dataSource, resolver),
    inserts,
    credits,
    resolver,
    manager,
  };
}

const INPUT = {
  projetId: 'projet-1',
  paymentIntentId: 'pi_apport_1',
  montantEur: 25_000,
  porteurUserId: 7,
  origine: 'webhook' as const,
};

describe('CrediterApportPorteurUseCase', () => {
  it('inscrit l’écriture AVANT de créditer, et crédite le portefeuille du projet', async () => {
    const h = createHarness();

    const resultat = await h.useCase.execute(INPUT);

    expect(resultat).toEqual({
      credite: true,
      walletId: 'w-projet',
      soldeApres: 26_000,
    });

    // L'ordre est la garantie d'idempotence : un rejeu bute sur la contrainte
    // d'unicité de l'écriture AVANT d'avoir touché au solde.
    const ordre = h.manager.insert.mock.invocationCallOrder[0];
    const ordreCredit = h.manager.createQueryBuilder.mock.invocationCallOrder[0];
    expect(ordre).toBeLessThan(ordreCredit);

    expect(h.credits).toEqual([{ walletId: 'w-projet', montant: 25_000 }]);
  });

  it('écrit un mouvement à contrepartie EXTERNE : source nulle, destination = projet', async () => {
    const h = createHarness();
    await h.useCase.execute(INPUT);

    expect(h.inserts[0]).toEqual(
      expect.objectContaining({
        walletSource: null,
        walletDestination: 'w-projet',
        type: TransactionType.APPORT_PORTEUR,
        montant: 25_000,
        devise: 'EUR',
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.STRIPE,
        fournisseurRef: 'pi_apport_1',
        projetId: 'projet-1',
        idempotencyKey: 'apport-porteur:pi_apport_1',
      }),
    );
  });

  it('résout le portefeuille SOUS le verrou de la ligne projet', async () => {
    const h = createHarness();
    await h.useCase.execute(INPUT);
    // Aucune option `verrouillerProjet: false` : le verrou est bien pris ici,
    // seule barrière contre deux apports concurrents créant deux portefeuilles.
    expect(h.resolver.executeInTransaction).toHaveBeenCalledWith(
      h.manager,
      'projet-1',
    );
  });

  it('est idempotent : un rejeu ne recrédite RIEN', async () => {
    const h = createHarness({ insertJette: violationUnicite() });

    const resultat = await h.useCase.execute(INPUT);

    expect(resultat.credite).toBe(false);
    expect(h.credits).toEqual([]); // le solde n'a jamais bougé
    expect(resultat.walletId).toBe('w-projet');
  });

  it('laisse remonter une panne qui n’est PAS un doublon', async () => {
    const panne = Object.assign(new Error('connexion perdue'), { code: '08006' });
    const h = createHarness({ insertJette: panne });

    await expect(h.useCase.execute(INPUT)).rejects.toThrow('connexion perdue');
    expect(h.credits).toEqual([]);
  });

  it('dérive la clé d’idempotence du seul encaissement', () => {
    expect(CrediterApportPorteurUseCase.cleIdempotence('pi_abc')).toBe(
      'apport-porteur:pi_abc',
    );
  });
});
