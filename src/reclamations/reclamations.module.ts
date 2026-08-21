import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReclamationEntity } from './infrastructure/persistences/entities/reclamation.entity';
import { ReclamationsService } from './applications/reclamations.service';
import { ReclamationsController } from './presenters/http/reclamations.controller';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';

/** Traitement des réclamations — art. 27 du règlement (UE) 2020/1503. */
@Module({
  imports: [TypeOrmModule.forFeature([ReclamationEntity]), IamInfrastructureModule],
  providers: [ReclamationsService],
  controllers: [ReclamationsController],
  exports: [ReclamationsService],
})
export class ReclamationsModule {}
