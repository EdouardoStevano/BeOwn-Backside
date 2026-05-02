import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationEntity } from './persistences/entities/reservation.entity';
import { ReservationTypeOrmRepository } from './persistences/repositories/reservation.repository';
import { RESERVATION_REPOSITORY } from '../applications/ports/repositories/reservation.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ReservationEntity])],
  providers: [
    { provide: RESERVATION_REPOSITORY, useClass: ReservationTypeOrmRepository },
  ],
  exports: [RESERVATION_REPOSITORY],
})
export class ReservationsInfrastructureModule {}
