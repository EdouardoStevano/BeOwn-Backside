import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailMethod } from 'src/users/domains/tfa-method';
import { TfaRepository } from 'src/users/domain/ports/tfa.repository';
import { EmailMethodEntity } from '../entities/email-method.entity';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class TfaTypeOrmRepository implements TfaRepository {
  constructor(
    @InjectRepository(EmailMethodEntity)
    private readonly emailMethodRepo: Repository<EmailMethodEntity>,
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
}
