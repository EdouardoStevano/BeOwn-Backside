import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RESERVATION_CAPACITY_REPOSITORY } from '../domain/repositories/reservation-capacity.repository';
import { RESERVATION_REPOSITORY } from '../domain/repositories/reservation.repository';
import { ReservationEntity } from './persistence/entities/reservation.entity';
import { TypeOrmReservationCapacityRepository } from './repositories/typeorm-reservation-capacity.repository';
import { TypeOrmReservationRepository } from './repositories/typeorm-reservation.repository';

/**
 * Adapters de sortie du contexte Reservation : les implémentations de ses
 * deux ports de persistance, et rien d'autre. Un consommateur dépend du port,
 * jamais de la classe TypeORM qui l'implémente (§33).
 */
@Module({
  imports: [TypeOrmModule.forFeature([ReservationEntity])],
  providers: [
    { provide: RESERVATION_REPOSITORY, useClass: TypeOrmReservationRepository },
    {
      provide: RESERVATION_CAPACITY_REPOSITORY,
      useClass: TypeOrmReservationCapacityRepository,
    },
  ],
  exports: [RESERVATION_REPOSITORY, RESERVATION_CAPACITY_REPOSITORY],
})
export class ReservationInfrastructureModule {}
