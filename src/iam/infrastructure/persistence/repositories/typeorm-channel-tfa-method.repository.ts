import { In, Repository } from 'typeorm';
import { ChannelTfaMethod } from 'src/iam/domains/models/channel-tfa-method';
import { ChannelTfaMethodRepository } from 'src/iam/domains/ports/channel-tfa-method.repository';
import { TFAMethodEntity } from 'src/iam/infrastructure/persistence/entities/tfa-method.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';

/**
 * Socle TypeORM des méthodes 2FA « à canal ». `tfa_methods` est une table
 * unique à héritage (STI) : le repository d'une `@ChildEntity` filtre déjà sur
 * le discriminant `type_method` en lecture, ce qui suffit à isoler les lignes
 * email des lignes SMS.
 *
 * Les écritures de masse passent volontairement par un `SELECT` d'identifiants
 * puis un `update({ id: In(ids) })` plutôt que par un `UpdateQueryBuilder` sur
 * la classe fille : ce dernier n'ajoute pas le discriminant à sa clause
 * `WHERE` et écraserait les méthodes des autres canaux du même utilisateur.
 *
 * Seule la colonne de destination diffère entre les canaux, d'où les deux
 * points d'extension laissés aux sous-classes.
 */
export abstract class TypeOrmChannelTfaMethodRepository<
  TEntity extends TFAMethodEntity,
> implements ChannelTfaMethodRepository {
  protected constructor(protected readonly repo: Repository<TEntity>) {}

  /** Lit la destination portée par la colonne propre au canal. */
  protected abstract targetOf(entity: TEntity): string;

  /** Construit le fragment d'entité portant la destination. */
  protected abstract targetColumn(target: string): Record<string, string>;

  async create(userId: number, target: string): Promise<number> {
    const method = this.repo.create({
      isActive: false,
      user: { userId } as UserEntity,
      ...this.targetColumn(target),
    } as unknown as TEntity);

    const saved = await this.repo.save(method);
    return saved.TFAMethodId;
  }

  async findAllByUserId(userId: number): Promise<ChannelTfaMethod[]> {
    const entities = await this.repo
      .createQueryBuilder('method')
      .leftJoin('method.user', 'user')
      .where('user.userId = :userId', { userId })
      .orderBy('method.TFAMethodId', 'DESC')
      .getMany();

    return entities.map((entity) => ({
      id: entity.TFAMethodId,
      isActive: entity.isActive,
      target: this.targetOf(entity),
    }));
  }

  async deletePendingForUser(userId: number): Promise<void> {
    const ids = await this.idsForUser(userId, { onlyPending: true });
    if (ids.length === 0) return;
    await this.repo.delete(ids);
  }

  async deactivateAllForUser(userId: number): Promise<void> {
    const ids = await this.idsForUser(userId);
    if (ids.length === 0) return;
    await this.repo.update(
      { TFAMethodId: In(ids) } as never,
      {
        isActive: false,
      } as never,
    );
  }

  async activate(methodId: number): Promise<void> {
    await this.repo.update(
      { TFAMethodId: methodId } as never,
      {
        isActive: true,
      } as never,
    );
  }

  private async idsForUser(
    userId: number,
    options: { onlyPending?: boolean } = {},
  ): Promise<number[]> {
    const query = this.repo
      .createQueryBuilder('method')
      .select('method.TFAMethodId', 'id')
      .leftJoin('method.user', 'user')
      .where('user.userId = :userId', { userId });

    if (options.onlyPending) {
      query.andWhere('method.isActive = false');
    }

    const rows = await query.getRawMany<{ id: number }>();
    return rows.map((row) => row.id);
  }
}
