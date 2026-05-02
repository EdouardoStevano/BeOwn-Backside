import { Module } from '@nestjs/common';
import { SecondaryMarketInfrastructureModule } from '../infrastructures/secondary-market-infrastructure.module';
import { SecondaryMarketController } from '../presenters/http/secondary-market.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

@Module({
  imports: [SecondaryMarketInfrastructureModule, IamInfrastructureModule],
  controllers: [SecondaryMarketController],
})
export class SecondaryMarketModule {}
