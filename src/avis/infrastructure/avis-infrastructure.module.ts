import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvisEntity } from './persistences/entities/avis.entity';
import { AvisTypeOrmRepository } from './persistences/repositories/avis.repository';
import { AVIS_REPOSITORY } from '../applications/ports/repositories/avis.repository';

@Module({
  imports: [TypeOrmModule.forFeature([AvisEntity])],
  providers: [{ provide: AVIS_REPOSITORY, useClass: AvisTypeOrmRepository }],
  exports: [AVIS_REPOSITORY],
})
export class AvisInfrastructureModule {}
