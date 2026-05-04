import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailMethod, TotpMethod } from 'src/users/domains/tfa-method';
import { TfaRepository } from 'src/users/domain/ports/tfa.repository';
import { EmailMethodEntity } from '../entities/email-method.entity';
import { TOTPMethodEntity } from '../entities/totp-method.entity';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class TfaTypeOrmRepository implements TfaRepository {
  constructor(
    @InjectRepository(EmailMethodEntity)
    private readonly emailMethodRepo: Repository<EmailMethodEntity>,
    @InjectRepository(TOTPMethodEntity)
    private readonly totpMethodRepo: Repository<TOTPMethodEntity>,
  ) {}

  async findEmailMethodByUserId(userId: number): Promise<EmailMethod | null> {
    const entity = await this.emailMethodRepo.findOne({
      where: { user: { userId } },
    });
    if (!entity) return null;
    const method = new EmailMethod();
    method.tfaMethodId = entity.TFAMethodId;
    method.isActive = entity.isActive;
    method.activatedDate = entity.activatedDate;
    method.emailOtp = entity.emailOTP;
    return method;
  }

  async saveEmailMethod(method: EmailMethod, userId: number): Promise<EmailMethod> {
    let entity: EmailMethodEntity;

    if (method.tfaMethodId) {
      entity = await this.emailMethodRepo.findOneOrFail({
        where: { TFAMethodId: method.tfaMethodId },
      });
    } else {
      entity = new EmailMethodEntity();
      entity.user = { userId } as UserEntity;
    }

    entity.isActive = method.isActive;
    entity.emailOTP = method.emailOtp;

    const saved = await this.emailMethodRepo.save(entity);
    method.tfaMethodId = saved.TFAMethodId;
    return method;
  }

  async findTotpMethodByUserId(userId: number): Promise<TotpMethod | null> {
    const entity = await this.totpMethodRepo
      .createQueryBuilder('totp')
      .addSelect('totp.secretKeyOtp')
      .where('totp.user_id = :userId', { userId })
      .getOne();
    if (!entity) return null;
    const method = new TotpMethod();
    method.tfaMethodId = entity.TFAMethodId;
    method.isActive = entity.isActive;
    method.activatedDate = entity.activatedDate;
    method.secretKeyOtp = entity.secretKeyOtp;
    return method;
  }

  async saveTotpMethod(method: TotpMethod, userId: number): Promise<TotpMethod> {
    let entity: TOTPMethodEntity;

    if (method.tfaMethodId) {
      const found = await this.totpMethodRepo
        .createQueryBuilder('totp')
        .addSelect('totp.secretKeyOtp')
        .where('totp.TFAMethodId = :id', { id: method.tfaMethodId })
        .getOne();
      if (!found) throw new Error('TOTP method not found');
      entity = found;
    } else {
      entity = new TOTPMethodEntity();
      entity.user = { userId } as UserEntity;
    }

    entity.isActive = method.isActive;
    entity.secretKeyOtp = method.secretKeyOtp;

    const saved = await this.totpMethodRepo.save(entity);
    method.tfaMethodId = saved.TFAMethodId;
    return method;
  }
}
