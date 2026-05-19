import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocataireEntity } from './persistences/entities/locataire.entity';
import { UniteLouableEntity } from './persistences/entities/unite-louable.entity';
import { LocataireTypeOrmRepository } from './persistences/repositories/locataire.repository';
import { UniteLouableTypeOrmRepository } from './persistences/repositories/unite-louable.repository';
import { LOCATAIRE_REPOSITORY } from '../applications/ports/repositories/locataire.repository';
import { UNITE_LOUABLE_REPOSITORY } from '../applications/ports/repositories/unite-louable.repository';

@Module({
  imports: [TypeOrmModule.forFeature([LocataireEntity, UniteLouableEntity])],
  providers: [
    { provide: LOCATAIRE_REPOSITORY, useClass: LocataireTypeOrmRepository },
    {
      provide: UNITE_LOUABLE_REPOSITORY,
      useClass: UniteLouableTypeOrmRepository,
    },
  ],
  exports: [LOCATAIRE_REPOSITORY, UNITE_LOUABLE_REPOSITORY],
})
export class LocativeManagementInfrastructureModule {}
