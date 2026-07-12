import { Module } from '@nestjs/common';
import { ReservationsInfrastructureModule } from '../infrastructure/reservations-infrastructure.module';
import { ProjectsInfrastructureModule } from 'src/projects/infrastructure/projects-infrastructure.module';
import { CreateReservationUseCase } from './usecases/create-reservation.usecase';
import { CancelReservationUseCase } from './usecases/cancel-reservation.usecase';
import { ReservationController } from '../presenters/http/reservation.controller';
import { RESERVATION_REPOSITORY } from './ports/repositories/reservation.repository';

@Module({
  imports: [
    ReservationsInfrastructureModule,
    ProjectsInfrastructureModule,
  ],
  providers: [CreateReservationUseCase, CancelReservationUseCase],
  controllers: [ReservationController],
  exports: [CreateReservationUseCase],
})
export class ReservationsModule {}
