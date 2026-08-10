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
