import { AttribuerBonusParrainageService } from './attribuer-bonus-parrainage.service';
import { ParrainageAttributionEntity } from '../infrastructure/persistences/entities/parrainage-attribution.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';

/**
 * Attribution du bonus — le chemin crédite de l'argent ex nihilo : ces specs
 * figent les trois garanties qui comptent, sur doubles purs (aucune base) :
 *   1. sans parrain déclaré, RIEN n'est écrit nulle part ;
 *   2. un rejeu (violation d'unicité sur filleulId) est silencieux — jamais
 *      une erreur chez l'appelant, jamais un wallet touché ;
 *   3. le chemin nominal insère l'attribution PUIS crédite les deux wallets
 *      avec des clés d'idempotence distinctes, et n'échoue jamais chez
 *      l'appelant même si la notification tombe.
 */
const uniqueViolation = () => {
  const err = new Error('duplicate key value violates unique constraint') as Error & {
    code?: string;
  };
  err.code = '23505';
  return err;
};

const fauxQueryBuilderLecture = () => {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['select', 'where', 'andWhere', 'setParameter', 'setParameters']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb.getRawOne = jest.fn().mockResolvedValue({ total: '0' });
  return qb;
};

const fauxQueryBuilderUpdate = () => {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['update', 'set', 'where', 'setParameter']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb.execute = jest.fn().mockResolvedValue({ affected: 1 });
  return qb;
};

const build = (opts: {
  parrainePar: number | null;
  saveAttributionErreur?: Error;
}) => {
  const saves: Array<{ cible: unknown; valeur: any }> = [];
  const em = {
    create: jest.fn((_cible: unknown, valeur: any) => valeur),
    save: jest.fn(async (cible: unknown, valeur: any) => {
      if (cible === ParrainageAttributionEntity && opts.saveAttributionErreur) {
        throw opts.saveAttributionErreur;
      }
      saves.push({ cible, valeur });
      if (cible === ParrainageAttributionEntity) {
        return { ...valeur, id: 'attr-1' };
      }
      if (cible === WalletEntity) return { ...valeur, id: 'w-neuf' };
      return valeur;
    }),
    findOne: jest.fn(async (cible: unknown) =>
      cible === WalletEntity ? { id: 'w-existant' } : null,
    ),
    createQueryBuilder: jest.fn((cible?: unknown) =>
      cible === ParrainageAttributionEntity
        ? fauxQueryBuilderLecture()
        : fauxQueryBuilderUpdate(),
    ),
  };
  const dataSource = {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest
        .fn()
        .mockResolvedValue(
          opts.parrainePar === undefined
            ? null
            : { userId: 9, parrainePar: opts.parrainePar },
        ),
    }),
    transaction: jest.fn(async (cb: (em: unknown) => Promise<unknown>) => cb(em)),
  };
  const notifications = { push: jest.fn().mockResolvedValue(undefined) };
  const service = new AttribuerBonusParrainageService(
    dataSource as never,
    notifications as never,
  );
  return { service, dataSource, em, saves, notifications };
};

describe('AttribuerBonusParrainageService', () => {
  const inv = { id: 'inv-1', utilisateurId: 9, montant: 5000 };

  it("sans parrain déclaré : aucune transaction, aucun crédit", async () => {
    const h = build({ parrainePar: null });
    await h.service.surInvestissementDefinitif(inv);
    expect(h.dataSource.transaction).not.toHaveBeenCalled();
    expect(h.notifications.push).not.toHaveBeenCalled();
  });

  it('rejeu (unicité filleulId violée) : silencieux, aucune notification', async () => {
    const h = build({ parrainePar: 3, saveAttributionErreur: uniqueViolation() });
    await expect(h.service.surInvestissementDefinitif(inv)).resolves.toBeUndefined();
    // L'INSERT de l'attribution a échoué AVANT tout crédit de wallet.
    expect(
      h.saves.filter((s) => s.cible === TransactionEntity),
    ).toHaveLength(0);
    expect(h.notifications.push).not.toHaveBeenCalled();
  });

  it('nominal : attribution insérée puis DEUX crédits aux clés distinctes + deux notifications', async () => {
    const h = build({ parrainePar: 3 });
    await h.service.surInvestissementDefinitif(inv);

    const attributions = h.saves.filter(
      (s) => s.cible === ParrainageAttributionEntity,
    );
    expect(attributions).toHaveLength(1);
    expect(attributions[0].valeur).toMatchObject({
      parrainId: 3,
      filleulId: 9,
      investissementId: 'inv-1',
      montantBase: 5000,
      bonusParrainEur: 50,
      bonusFilleulEur: 50,
    });

    const ecritures = h.saves.filter((s) => s.cible === TransactionEntity);
    expect(ecritures).toHaveLength(2);
    const cles = ecritures.map((e) => e.valeur.idempotencyKey).sort();
    expect(cles).toEqual([
      'parrainage:filleul:attr-1',
      'parrainage:parrain:attr-1',
    ]);
    for (const e of ecritures) {
      expect(e.valeur.walletSource).toBeNull();
      expect(e.valeur.montant).toBe(50);
      expect(e.valeur.metadata).toMatchObject({ kind: 'bonus_parrainage' });
    }

    expect(h.notifications.push).toHaveBeenCalledTimes(2);
  });

  it("une panne de notification n'échoue jamais chez l'appelant", async () => {
    const h = build({ parrainePar: 3 });
    h.notifications.push.mockRejectedValue(new Error('gateway down'));
    await expect(h.service.surInvestissementDefinitif(inv)).resolves.toBeUndefined();
    // Les crédits, eux, sont acquis (commis avant les notifications).
    expect(h.saves.filter((s) => s.cible === TransactionEntity)).toHaveLength(2);
  });

  it("auto-parrainage (données corrompues) : rien n'est écrit", async () => {
    const h = build({ parrainePar: 9 });
    await h.service.surInvestissementDefinitif(inv);
    expect(h.dataSource.transaction).not.toHaveBeenCalled();
  });
});
