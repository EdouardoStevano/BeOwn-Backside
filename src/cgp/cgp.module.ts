import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CgpController } from './cgp.controller';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, InvestmentEntity]),
  ],
  controllers: [CgpController],
})
export class CgpModule {}
