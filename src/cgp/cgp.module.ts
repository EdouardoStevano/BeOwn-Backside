import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CgpController } from './cgp.controller';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, InvestmentEntity]),
    IamInfrastructureModule,
  ],
  controllers: [CgpController],
})
export class CgpModule {}
