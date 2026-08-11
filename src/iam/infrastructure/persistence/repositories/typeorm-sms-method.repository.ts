import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SMSMethodEntity } from 'src/iam/infrastructure/persistence/entities/sms-method.entity';
import { TypeOrmChannelTfaMethodRepository } from './typeorm-channel-tfa-method.repository';

@Injectable()
export class TypeOrmSmsMethodRepository extends TypeOrmChannelTfaMethodRepository<SMSMethodEntity> {
  constructor(
    @InjectRepository(SMSMethodEntity) repo: Repository<SMSMethodEntity>,
  ) {
    super(repo);
  }

  protected targetOf(entity: SMSMethodEntity): string {
    return entity.phoneNumberOTP;
  }

  protected targetColumn(target: string): Record<string, string> {
    return { phoneNumberOTP: target };
  }
}
