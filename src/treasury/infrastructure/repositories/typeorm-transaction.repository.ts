import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type {
  ResultatDeConsignation,
  TransactionRepository,
} from 'src/treasury/domain/repositories/transaction.repository';
import type {
  Transaction,
  TransactionNaissante,
} from 'src/treasury/domain/aggregates/transaction';
import { TransactionEntity } from '../persistence/entities/transaction.entity';
import { WalletEntity } from '../persistence/entities/wallet.entity';
import { WalletOrmMapper } from '../persistence/mappers/wallet.orm-mapper';
import { WalletIntrouvableError } from 'src/treasury/domain/errors/treasury.errors';

/** Violation de contrainte d'unicité Postgres — ici, une clé d'idempotence rejouée. */
const UNICITE_VIOLEE = '23505';

const estUnDoublon = (err: unknown): boolean => {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code === UNICITE_VIOLEE || e?.driverError?.code === UNICITE_VIOLEE;
};

/**
 * Un mouvement qui déplace de l'argent désigne forcément un portefeuille.
 *
 * Le `WHERE id = NULL` qu'un `walletId` absent produirait n'affecterait aucune
 * ligne **sans lever** : le mouvement serait consigné et le solde n'aurait pas
 * bougé. C'est le seul endroit où cette vérification a un sens — les deux
 * consignations sont les seules opérations qui touchent un solde.
 */
function exigerUnPortefeuille(mouvement: TransactionNaissante): string {
  const walletId = mouvement.walletId ?? mouvement.walletSource;
  if (!walletId) {
    throw new WalletIntrouvableError();
  }
  return walletId;
}

/**
 * Le registre des mouvements, adossé à PostgreSQL.
 *
 * **C'est ici, et nulle part ailleurs, que l'argent bouge.** Les deux
 * consignations et le rendu de solde étaient écrits en `EntityManager` et
 * `QueryBuilder` bruts dans `PaymentController` et `RequestRetraitUseCase` —
 * c'est-à-dire qu'un contrôleur HTTP tenait le verrou pessimiste et composait
 * le `SET solde = solde - :amount` (§14, §27). Le code est le même à la ligne
 * près ; ce qui change, c'est qu'il est derrière un port, donc remplaçable et
 * doublable en test.
 */
@Injectable()
export class TypeOrmTransactionRepository implements TransactionRepository {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactions: Repository<TransactionEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async enregistrer(mouvement: TransactionNaissante): Promise<Transaction> {
    const saved = await this.transactions.save(
      WalletOrmMapper.txNaissanteToEntity(mouvement),
    );
    return WalletOrmMapper.txToDomain(saved);
  }

  async save(mouvement: Transaction): Promise<Transaction> {
    const saved = await this.transactions.save(
      WalletOrmMapper.txToEntity(mouvement),
    );
    return WalletOrmMapper.txToDomain(saved);
  }

  async findById(id: string): Promise<Transaction | null> {
    const entity = await this.transactions.findOne({ where: { id } });
    return entity ? WalletOrmMapper.txToDomain(entity) : null;
  }

  async findByWallet(walletId: string): Promise<Transaction[]> {
    const entities = await this.transactions
      .createQueryBuilder('t')
      .where(
        't.walletSource = :id OR t.walletDestination = :id OR t.walletId = :id',
        { id: walletId },
      )
      .orderBy('t.createdAt', 'DESC')
      .getMany();
    return entities.map(WalletOrmMapper.txToDomain);
  }

  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    const entity = await this.transactions.findOne({
      where: { idempotencyKey: key },
    });
    return entity ? WalletOrmMapper.txToDomain(entity) : null;
  }

  /**
   * L'insertion **d'abord**, le crédit ensuite.
   *
   * L'ordre est la garde : la contrainte d'unicité sur `idempotencyKey` rejette
   * le doublon avant que le solde n'ait bougé, si bien que l'incrément ne peut
   * pas s'exécuter deux fois pour un même paiement — même sous appels
   * concurrents (confirmation par le front et webhook Stripe en même temps).
   * L'inverse aurait crédité puis constaté le doublon, trop tard.
   */
  async consignerUnCredit(
    mouvement: TransactionNaissante,
  ): Promise<ResultatDeConsignation> {
    const walletId = exigerUnPortefeuille(mouvement);

    try {
      const consigne = await this.dataSource.transaction(async (em) => {
        const insere = await this.inserer(em, mouvement);
        await em
          .createQueryBuilder()
          .update(WalletEntity)
          .set({ solde: () => 'solde + :montant' })
          .setParameter('montant', mouvement.montant)
          .where('id = :id', { id: walletId })
          .execute();
        return insere;
      });
      return { issue: 'consigne', mouvement: consigne };
    } catch (err) {
      if (estUnDoublon(err)) return { issue: 'deja-consigne' };
      throw err;
    }
  }

  /**
   * Le décrément **conditionnel** sous verrou : `solde >= montant`.
   *
   * Deux retraits concurrents éprouveraient sinon la même lecture obsolète et
   * passeraient tous les deux. Aucune ligne affectée signifie que le solde ne
   * couvrait pas — le mouvement n'est alors pas consigné, et la transaction est
   * défaite entièrement.
   *
   * L'insertion vient **après** le débit, à l'inverse du crédit : ici la garde
   * n'est pas l'unicité mais la condition sur le solde, et il faut qu'elle ait
   * tranché avant qu'un mouvement n'entre au registre.
   */
  async consignerUnDebit(
    mouvement: TransactionNaissante,
  ): Promise<ResultatDeConsignation> {
    const walletId = exigerUnPortefeuille(mouvement);

    try {
      return await this.dataSource.transaction(
        async (em): Promise<ResultatDeConsignation> => {
          const ligne = await em.findOne(WalletEntity, {
            where: { id: walletId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!ligne) return { issue: 'solde-insuffisant' };

          const debit = await em
            .createQueryBuilder()
            .update(WalletEntity)
            .set({ solde: () => 'solde - :montant' })
            .setParameter('montant', mouvement.montant)
            .where('id = :id AND solde >= :montant', {
              id: ligne.id,
              montant: mouvement.montant,
            })
            .execute();
          if (!debit.affected) return { issue: 'solde-insuffisant' };

          return {
            issue: 'consigne',
            mouvement: await this.inserer(em, mouvement),
          };
        },
      );
    } catch (err) {
      if (estUnDoublon(err)) return { issue: 'deja-consigne' };
      throw err;
    }
  }

  /**
   * Le mouvement est relu **sous verrou**, la décision du domaine rejouée sur
   * cet état-là, et le solde n'est rendu que si elle a dit oui.
   *
   * C'est ce qui rend l'opération idempotente sans que l'appelant relise quoi
   * que ce soit : un échec de versement synchrone et un webhook `payout.failed`
   * qui se croisent voient le même verrou, et le second trouve un mouvement
   * déjà défait.
   */
  async rendreLeSolde(
    mouvementId: string,
    decider: (mouvement: Transaction) => boolean,
  ): Promise<'rendu' | 'sans-objet'> {
    return this.dataSource.transaction(async (em) => {
      const ligne = await em.findOne(TransactionEntity, {
        where: { id: mouvementId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!ligne) return 'sans-objet' as const;

      const mouvement = WalletOrmMapper.txToDomain(ligne);
      if (!decider(mouvement)) return 'sans-objet' as const;

      const walletId = mouvement.walletId;
      if (walletId) {
        await em
          .createQueryBuilder()
          .update(WalletEntity)
          .set({ solde: () => 'solde + :montant' })
          .setParameter('montant', mouvement.montant.montant)
          .where('id = :id', { id: walletId })
          .execute();
      }

      await em
        .getRepository(TransactionEntity)
        .save(WalletOrmMapper.txToEntity(mouvement));
      return 'rendu' as const;
    });
  }

  /**
   * `insert` et non `save` : seul le premier laisse remonter la violation
   * d'unicité qui sert de garde d'idempotence — `save` relirait la ligne
   * existante et la mettrait à jour, c'est-à-dire exactement le contraire.
   */
  private async inserer(
    em: EntityManager,
    mouvement: TransactionNaissante,
  ): Promise<Transaction> {
    const ligne = WalletOrmMapper.txNaissanteToEntity(mouvement);
    // `insert` attend un partiel « profond » que la colonne `metadata` — un
    // `jsonb` libre — ne satisfait pas structurellement. La ligne est bien une
    // entité complète ; le cast ne masque donc rien.
    const insertion = await em.insert(
      TransactionEntity,
      ligne as QueryDeepPartialEntity<TransactionEntity>,
    );

    // L'identité et les dates sont posées par la base ; `generatedMaps` les
    // rapporte, ce qui évite une relecture pour reconstruire l'agrégat rendu.
    const genere = (insertion.generatedMaps[0] ??
      {}) as Partial<TransactionEntity>;
    ligne.id = (genere.id ?? insertion.identifiers[0]?.id) as string;
    ligne.createdAt = genere.createdAt ?? new Date();
    ligne.updatedAt = genere.updatedAt ?? ligne.createdAt;

    return WalletOrmMapper.txToDomain(ligne);
  }
}
