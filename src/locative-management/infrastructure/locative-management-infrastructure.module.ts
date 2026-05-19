import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocataireEntity } from './persistences/entities/locataire.entity';
import { LocataireTypeOrmRepository } from './persistences/repositories/locataire.repository';
import { LOCATAIRE_REPOSITORY } from '../applications/ports/repositories/locataire.repository';

@Module({
  imports: [TypeOrmModule.forFeature([LocataireEntity])],
  providers: [
    { provide: LOCATAIRE_REPOSITORY, useClass: LocataireTypeOrmRepository },
  ],
  exports: [LOCATAIRE_REPOSITORY],
})
export class LocativeManagementInfrastructureModule {}
