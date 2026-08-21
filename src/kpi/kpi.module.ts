import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { TauxDefautPublicationService } from './applications/taux-defaut-publication.service';
import { TauxDefautController } from './presenters/http/taux-defaut.controller';

/**
 * KpiCalculator reste un module pur, importé directement par les services.
 * Seule la publication réglementaire des taux de défaut (art. 20 du règlement
 * (UE) 2020/1503) est exposée ici, car elle doit être servie publiquement.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, InvestmentEntity, EcheanceEntity]),
  ],
  controllers: [TauxDefautController],
  providers: [TauxDefautPublicationService],
  exports: [TauxDefautPublicationService],
})
export class KpiModule {}
