import { Module } from '@nestjs/common';
import { FiscaliteInfrastructureModule } from '../infrastructure/fiscalite-infrastructure.module';
import { DistributionsInfrastructureModule } from 'src/distributions/infrastructure/distributions-infrastructure.module';
import { InvestmentsInfrastructureModule } from 'src/investments/infrastructure/investments-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
// Profil personne physique : résidence fiscale et NIF du bénéficiaire de
// l'IFU (art. 242 ter CGI ; art. 1649 AC CGI / DAC2-CRS). Aucun cycle — le
// module profils n'importe rien de la fiscalité.
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
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
    ProfilesInfrastructureModule,
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
