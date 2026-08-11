import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailMethodEntity } from 'src/iam/infrastructure/persistence/entities/email-method.entity';
import { TypeOrmChannelTfaMethodRepository } from './typeorm-channel-tfa-method.repository';

@Injectable()
export class TypeOrmEmailMethodRepository extends TypeOrmChannelTfaMethodRepository<EmailMethodEntity> {
  constructor(
    @InjectRepository(EmailMethodEntity) repo: Repository<EmailMethodEntity>,
  ) {
    super(repo);
  }

  protected targetOf(entity: EmailMethodEntity): string {
    return entity.emailOTP;
  }

  protected targetColumn(target: string): Record<string, string> {
    return { emailOTP: target };
  }
}
