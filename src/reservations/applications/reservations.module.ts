import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationsInfrastructureModule } from '../infrastructure/reservations-infrastructure.module';
import { CatalogInfrastructureModule } from 'src/catalog/infrastructure/catalog-infrastructure.module';
import { CreateReservationUseCase } from './usecases/create-reservation.usecase';
import { CancelReservationUseCase } from './usecases/cancel-reservation.usecase';
import { ReservationController } from '../presenters/http/reservation.controller';
import { RESERVATION_REPOSITORY } from './ports/repositories/reservation.repository';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { KycModule } from 'src/compliance/application/kyc.module';

@Module({
  imports: [
    ReservationsInfrastructureModule,
    CatalogInfrastructureModule,
    IamInfrastructureModule,
    // `KycValidatedGuard` : réserver exige un dossier vérifié.
    KycModule,
  ],
  providers: [
    CreateReservationUseCase,
    CancelReservationUseCase,
  ],
  controllers: [ReservationController],
  exports: [CreateReservationUseCase],
})
export class ReservationsModule {}
