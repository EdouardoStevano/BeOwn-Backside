import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateReservationUseCase } from 'src/reservations/applications/usecases/create-reservation.usecase';
import { CancelReservationUseCase } from 'src/reservations/applications/usecases/cancel-reservation.usecase';
import {
  CancelReservationDto,
  CreateReservationDto,
} from '../dto/reservation.dto';
import { Inject } from '@nestjs/common';
import { RESERVATION_REPOSITORY } from 'src/reservations/applications/ports/repositories/reservation.repository';
import type { ReservationRepository } from 'src/reservations/applications/ports/repositories/reservation.repository';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';

@ApiTags('Reservations (Pré-investissement)')
@ApiBearerAuth()
@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationController {
  constructor(
    private readonly createReservation: CreateReservationUseCase,
    private readonly cancelReservation: CancelReservationUseCase,
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
  ) {}

  @ApiOperation({
    summary: 'Créer une réservation (pré-investissement) ◇ Spécificité BeOwn',
    description:
      'Permet à un investisseur KYC validé de réserver des parts sur un projet en statut ANNONCÉ avant ouverture de la collecte.',
  })
  @ApiResponse({
    status: 201,
    description: 'Réservation enregistrée, rang attribué',
  })
  @ApiResponse({
    status: 400,
    description: 'Projet non ouvert aux réservations ou montant invalide',
  })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Post()
  create(@Body() dto: CreateReservationDto, @CurrentUser() user: ActiveUser) {
    return this.createReservation.execute(user.userId, dto);
  }

  @ApiOperation({ summary: 'Lister mes réservations' })
  @ApiResponse({ status: 200, description: 'Liste des réservations' })
  @Get('user/:userId')
  listByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.reservationRepository.findByUserId(userId);
  }

  @ApiOperation({ summary: "Lister les réservations d'un projet" })
  @ApiResponse({ status: 200, description: 'Liste des réservations du projet' })
  @Get('project/:projetId')
  listByProject(@Param('projetId') projetId: string) {
    return this.reservationRepository.findByProjetId(projetId);
  }

  @ApiOperation({ summary: 'Annuler une réservation (investisseur)' })
  @ApiResponse({
    status: 200,
    description: 'Réservation annulée, fonds débloqués',
  })
  @HttpCode(HttpStatus.OK)
  @Delete(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelReservationDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.cancelReservation.execute(id, user.userId, false, dto.motif);
  }

  @ApiOperation({ summary: 'Annuler une réservation (admin)' })
  @ApiResponse({ status: 200, description: 'Réservation annulée par admin' })
  @HttpCode(HttpStatus.OK)
  @Delete(':id/admin-cancel')
  adminCancel(@Param('id') id: string, @Body() dto: CancelReservationDto) {
    return this.cancelReservation.execute(id, 0, true, dto.motif);
  }
}
