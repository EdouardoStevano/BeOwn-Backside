import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TfaRepository } from 'src/users/applications/ports/repositories/tfa.repository';
import { TfaMethod } from 'src/users/domains/tfa-method';
import { TwoFactorMethod } from 'src/users/domains/enums/user.enum';
import { TFAMethodEntity } from '../entities/tfa-method.entity';
import { EmailMethodEntity } from '../entities/email-method.entity';
import { SMSMethodEntity } from '../entities/sms-method.entity';
import { TOTPMethodEntity } from '../entities/totp-method.entity';
import { TfaMapper } from '../mappers/tfa-method.mapper';

/**
 * Les trois canaux partagent une table (héritage de table unique TypeORM). On
 * passe donc par les repositories des sous-classes : eux seuls ajoutent
 * automatiquement la condition sur le discriminant `type_method`.
 */
@Injectable()
export class TfaTypeOrmRepository implements TfaRepository {
  constructor(
    @InjectRepository(TFAMethodEntity)
    private readonly methods: Repository<TFAMethodEntity>,
    @InjectRepository(EmailMethodEntity)
    private readonly emailMethods: Repository<EmailMethodEntity>,
    @InjectRepository(SMSMethodEntity)
    private readonly smsMethods: Repository<SMSMethodEntity>,
    @InjectRepository(TOTPMethodEntity)
    private readonly totpMethods: Repository<TOTPMethodEntity>,
  ) {}

  async findOne(
    userId: number,
    method: TwoFactorMethod,
  ): Promise<TfaMethod | null> {
    const entity = await this.findEntity(userId, method);
    return entity ? TfaMapper.toDomain(entity) : null;
  }

  async findActive(userId: number): Promise<TfaMethod | null> {
    const entity = await this.methods.findOne({
      where: { userId, isActive: true },
    });
    if (!entity) return null;

    // Le secret TOTP est en `select: false` : la requête ci-dessus ne le ramène
    // pas. On recharge la ligne par son canal, qui sait aller le chercher.
    return this.findOne(userId, TfaMapper.methodOf(entity));
  }

  async upsert(userId: number, method: TfaMethod): Promise<TfaMethod> {
    const existing = await this.findEntity(userId, method.method);

    const entity = TfaTypeOrmRepository.toEntity(userId, method);
    if (existing) entity.TFAMethodId = existing.TFAMethodId;

    // `manager.save` déduit la sous-classe — donc le discriminant — du
    // constructeur de l'instance.
    const saved = await this.methods.manager.save(entity);
    return TfaMapper.toDomain(saved);
  }

  async activateOnly(userId: number, method: TwoFactorMethod): Promise<void> {
    await this.deactivateAll(userId);

    const entity = await this.findEntity(userId, method);
    if (!entity) return;

    entity.isActive = true;
    await this.methods.manager.save(entity);
  }

  async deactivateAll(userId: number): Promise<void> {
    await this.methods.update({ userId }, { isActive: false });
  }

  private findEntity(
    userId: number,
    method: TwoFactorMethod,
  ): Promise<TFAMethodEntity | null> {
    switch (method) {
      case TwoFactorMethod.EMAIL:
        return this.emailMethods.findOne({ where: { userId } });
      case TwoFactorMethod.SMS:
        return this.smsMethods.findOne({ where: { userId } });
      case TwoFactorMethod.TOTP:
        return this.totpMethods
          .createQueryBuilder('totp')
          .addSelect('totp.secretKeyOtp')
          .where('totp.user_id = :userId', { userId })
          .getOne();
    }
  }

  private static toEntity(userId: number, method: TfaMethod): TFAMethodEntity {
    let entity: TFAMethodEntity;

    switch (method.method) {
      case TwoFactorMethod.EMAIL: {
        const email = new EmailMethodEntity();
        email.emailOTP = method.credential;
        entity = email;
        break;
      }
      case TwoFactorMethod.SMS: {
        const sms = new SMSMethodEntity();
        sms.phoneNumberOTP = method.credential;
        entity = sms;
        break;
      }
      case TwoFactorMethod.TOTP: {
        const totp = new TOTPMethodEntity();
        totp.secretKeyOtp = method.credential;
        entity = totp;
        break;
      }
    }

    entity.userId = userId;
    entity.isActive = method.isActive;
    return entity;
  }
}
