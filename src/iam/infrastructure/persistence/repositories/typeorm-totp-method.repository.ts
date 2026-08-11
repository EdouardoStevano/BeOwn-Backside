import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TotpMethod } from 'src/iam/domains/models/totp-method';
import { TotpMethodRepository } from 'src/iam/domains/ports/totp-method.repository';
import { TOTPMethodEntity } from 'src/iam/infrastructure/persistence/entities/totp-method.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';

@Injectable()
export class TypeOrmTotpMethodRepository implements TotpMethodRepository {
  constructor(
    @InjectRepository(TOTPMethodEntity)
    private readonly totpRepo: Repository<TOTPMethodEntity>,
  ) {}

  async create(userId: number, encryptedSecret: string): Promise<void> {
    const method = this.totpRepo.create({
      isActive: false,
      secretKeyOtp: encryptedSecret,
      user: { userId } as UserEntity,
    });
    await this.totpRepo.save(method);
  }

  async findAllByUserId(userId: number): Promise<TotpMethod[]> {
    // `secretKeyOtp` est en `select: false` sur l'entité — il faut le
    // réintroduire explicitement, d'où le query builder plutôt qu'un `find`.
    const entities = await this.totpRepo
      .createQueryBuilder('method')
      .addSelect('method.secretKeyOtp')
      .leftJoin('method.user', 'user')
      .where('user.userId = :userId', { userId })
      .orderBy('method.TFAMethodId', 'DESC')
      .getMany();

    return entities.map((entity) => ({
      id: entity.TFAMethodId,
      isActive: entity.isActive,
      encryptedSecret: entity.secretKeyOtp,
    }));
  }

  async deletePendingForUser(userId: number): Promise<void> {
    // Suppression par identifiants plutôt que par `DELETE ... WHERE user_id` :
    // la clause d'un query builder de `@ChildEntity` ne porte pas toujours le
    // discriminant, et un `DELETE` large emporterait les méthodes email/SMS du
    // même utilisateur. Le `SELECT` préalable passe, lui, par le repository de
    // la classe fille, donc déjà filtré sur `type_method`.
    const rows = await this.totpRepo
      .createQueryBuilder('method')
      .select('method.TFAMethodId', 'id')
      .leftJoin('method.user', 'user')
      .where('user.userId = :userId', { userId })
      .andWhere('method.isActive = false')
      .getRawMany<{ id: number }>();

    if (rows.length === 0) return;
    await this.totpRepo.delete(rows.map((row) => row.id));
  }

  async deactivateAllForUser(userId: number): Promise<void> {
    await this.totpRepo
      .createQueryBuilder()
      .update(TOTPMethodEntity)
      .set({ isActive: false })
      .where('user_id = :userId', { userId })
      .execute();
  }

  async activate(methodId: number): Promise<void> {
    await this.totpRepo.update({ TFAMethodId: methodId }, { isActive: true });
  }
}
