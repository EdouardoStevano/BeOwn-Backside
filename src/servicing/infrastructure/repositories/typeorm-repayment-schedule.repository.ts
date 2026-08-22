import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RepaymentSchedule } from 'src/servicing/domain/aggregates/repayment-schedule';
import type { RepaymentScheduleRepository } from 'src/servicing/domain/repositories/repayment-schedule.repository';
import { EcheanceEntity } from '../persistence/entities/echeance.entity';
import { EcheanceOrmMapper } from '../persistence/mappers/echeance.orm-mapper';

/** L'adapter TypeORM du port `RepaymentScheduleRepository` (§33). */
@Injectable()
export class TypeOrmRepaymentScheduleRepository implements RepaymentScheduleRepository {
  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeances: Repository<EcheanceEntity>,
  ) {}

  async findByInvestissement(
    investissementId: string,
  ): Promise<RepaymentSchedule> {
    const lignes = await this.echeances.find({
      where: { investissementId },
      order: { numero: 'ASC' },
    });

    return RepaymentSchedule.reconstituer(
      investissementId,
      lignes.map(EcheanceOrmMapper.toDomain),
    );
  }
}
