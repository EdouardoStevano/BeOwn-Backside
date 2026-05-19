import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocataireEntity } from './persistences/entities/locataire.entity';
import { UniteLouableEntity } from './persistences/entities/unite-louable.entity';
import { BailEntity } from './persistences/entities/bail.entity';
import { LocataireTypeOrmRepository } from './persistences/repositories/locataire.repository';
import { UniteLouableTypeOrmRepository } from './persistences/repositories/unite-louable.repository';
import { BailTypeOrmRepository } from './persistences/repositories/bail.repository';
import { LOCATAIRE_REPOSITORY } from '../applications/ports/repositories/locataire.repository';
import { UNITE_LOUABLE_REPOSITORY } from '../applications/ports/repositories/unite-louable.repository';
import { BAIL_REPOSITORY } from '../applications/ports/repositories/bail.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([LocataireEntity, UniteLouableEntity, BailEntity]),
  ],
  providers: [
    { provide: LOCATAIRE_REPOSITORY, useClass: LocataireTypeOrmRepository },
    {
      provide: UNITE_LOUABLE_REPOSITORY,
      useClass: UniteLouableTypeOrmRepository,
    },
    { provide: BAIL_REPOSITORY, useClass: BailTypeOrmRepository },
  ],
  exports: [LOCATAIRE_REPOSITORY, UNITE_LOUABLE_REPOSITORY, BAIL_REPOSITORY],
})
export class LocativeManagementInfrastructureModule {}
