import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { MfaMethod } from 'src/iam/domains/models/mfa-method';
import { MfaMethodRepository } from 'src/iam/domains/ports/mfa-method.repository';
import { MfaMethodEntity } from 'src/iam/infrastructure/persistence/entities/mfa-method.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';

/**
 * Adapter TypeORM du port MFA — **un seul**, là où il y en avait quatre
 * (`TypeOrmTotpMethodRepository`, la base `TypeOrmChannelTfaMethodRepository`
 * et ses deux sous-classes email/SMS).
 *
 * Le canal étant une colonne, les écritures de masse le filtrent directement
 * en SQL. C'est la simplification décisive : le détour par un `SELECT`
 * d'identifiants puis un `delete(ids)` n'existait que parce qu'un
 * `UpdateQueryBuilder` sur une `@ChildEntity` omet le discriminant et aurait
 * emporté les facteurs des autres canaux.
 */
@Injectable()
export class TypeOrmMfaMethodRepository implements MfaMethodRepository {
  constructor(
    @InjectRepository(MfaMethodEntity)
    private readonly repo: Repository<MfaMethodEntity>,
  ) {}

  async create(
    userId: number,
    method: MfaMethodType,
    credential: string,
  ): Promise<number> {
    const saved = await this.repo.save(
      this.repo.create({
        method,
        credential,
        isActive: false,
        user: { userId } as UserEntity,
      }),
    );

    return saved.id;
  }

  async findAllByUserId(
    userId: number,
    method: MfaMethodType,
  ): Promise<MfaMethod[]> {
    // `credential` est en `select: false` sur l'entité — il faut le
    // réintroduire explicitement, d'où le query builder plutôt qu'un `find`.
    const entities = await this.repo
      .createQueryBuilder('mfa')
      .addSelect('mfa.credential')
      .where('mfa.user_id = :userId', { userId })
      .andWhere('mfa.method = :method', { method })
      .orderBy('mfa.id', 'DESC')
      .getMany();

    // `rehydrate` et non un objet nu : c'est l'entité de domaine qui décide
    // ensuite ce que son `credential` accepte de rendre, et sous quelle forme.
    return entities.map((entity) =>
      MfaMethod.rehydrate({
        id: entity.id,
        method: entity.method,
        isActive: entity.isActive,
        credential: entity.credential,
      }),
    );
  }

  async deletePendingForUser(
    userId: number,
    method: MfaMethodType,
  ): Promise<void> {
    await this.repo.delete({
      user: { userId } as UserEntity,
      method,
      isActive: false,
    });
  }

  async deactivateChannel(
    userId: number,
    method: MfaMethodType,
  ): Promise<void> {
    await this.repo.update(
      { user: { userId } as UserEntity, method },
      { isActive: false },
    );
  }

  async deactivateAll(userId: number): Promise<void> {
    await this.repo.update(
      { user: { userId } as UserEntity },
      { isActive: false },
    );
  }

  async activate(methodId: number): Promise<void> {
    await this.repo.update({ id: methodId }, { isActive: true });
  }
}
