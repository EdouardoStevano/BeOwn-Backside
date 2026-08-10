import { Module } from '@nestjs/common';
import { FiscaliteInfrastructureModule } from '../infrastructure/fiscalite-infrastructure.module';
import { DistributionsInfrastructureModule } from 'src/distributions/infrastructure/distributions-infrastructure.module';
import { InvestmentsInfrastructureModule } from 'src/investments/infrastructure/investments-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { GenerateInvestisseurIfuUseCase } from './usecases/generate-investisseur-ifu.usecase';
import { IfuPdfService } from './ifu-pdf.service';
import { IfuCronService } from './ifu-cron.service';
import { InvestisseurFiscaliteController } from '../presenters/http/investisseur-fiscalite.controller';
import { AdminFiscaliteController } from '../presenters/http/admin-fiscalite.controller';

@Module({
  imports: [
    FiscaliteInfrastructureModule,
    DistributionsInfrastructureModule,
    InvestmentsInfrastructureModule,
    UsersInfrastructureModule,
    IamInfrastructureModule,
  ],
  controllers: [InvestisseurFiscaliteController, AdminFiscaliteController],
  providers: [
    GenerateInvestisseurIfuUseCase,
    IfuPdfService,
    IfuCronService,
  ],
  exports: [
    FiscaliteInfrastructureModule,
    GenerateInvestisseurIfuUseCase,
    IfuPdfService,
    IfuCronService,
  ],
})
export class FiscaliteModule {}
