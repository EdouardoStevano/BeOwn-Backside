import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { KycValidatedGuard } from 'src/compliance/presentation/guards/kyc-validated.guard';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { hasPermission } from 'src/iam/domain/policies/role-permissions.policy';
import { Roles } from 'src/iam/presentation/decorators/roles.decorator';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { CancelReservationUseCase } from '../../application/usecases/cancel-reservation.usecase';
import { CreateReservationUseCase } from '../../application/usecases/create-reservation.usecase';
import {
  ListProjectReservationsUseCase,
  ListUserReservationsUseCase,
} from '../../application/usecases/list-reservations.usecase';
import type { ReservationSnapshot } from '../../domain/aggregates/reservation';
import {
  CancelReservationDto,
  CreateReservationDto,
} from './dto/reservation.dto';

/**
 * Routes du Core Domain. Le contrôleur ne parle qu'aux use cases et rend des
 * snapshots — mêmes clés JSON que l'ancien modèle anémique qu'il sérialisait
 * tel quel. Les erreurs métier remontent telles quelles :
 * `ReservationErrorFilter` les traduit (§21).
 *
 * Le RBAC (`Roles`, `RequirePermission`) reste ici : c'est de la composition
 * d'accès, pas une règle du domaine (§3.3).
 */
@ApiTags('Reservations (Pré-investissement)')
@ApiBearerAuth()
@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationController {
  constructor(
    private readonly createReservation: CreateReservationUseCase,
    private readonly cancelReservation: CancelReservationUseCase,
    private readonly listUserReservations: ListUserReservationsUseCase,
    private readonly listProjectReservations: ListProjectReservationsUseCase,
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
  @UseGuards(KycValidatedGuard)
  @Roles(UserRole.INVESTISSEUR)
  @Post()
  async create(
    @Body() dto: CreateReservationDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<ReservationSnapshot> {
    const reservation = await this.createReservation.execute(user.userId, dto);
    return reservation.snapshot();
  }

  @ApiOperation({ summary: 'Lister mes réservations' })
  @ApiParam({ name: 'userId', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Liste des réservations' })
  @Get('user/:userId')
  async listByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: ActiveUser,
  ): Promise<ReservationSnapshot[]> {
    if (
      user.userId !== userId &&
      !hasPermission(user.role, 'reservations:manage') &&
      !hasPermission(user.role, 'users:read')
    ) {
      throw new ForbiddenException('Acces refuse.');
    }
    const reservations = await this.listUserReservations.execute(userId);
    return reservations.map((r) => r.snapshot());
  }

  @ApiOperation({ summary: "Lister les réservations d'un projet" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des réservations du projet' })
  @Get('project/:projetId')
  @RequirePermission('reservations:manage')
  async listByProject(
    @Param('projetId') projetId: string,
  ): Promise<ReservationSnapshot[]> {
    const reservations = await this.listProjectReservations.execute(projetId);
    return reservations.map((r) => r.snapshot());
  }

  @ApiOperation({ summary: 'Annuler une réservation (investisseur)' })
  @ApiParam({ name: 'id', description: 'UUID de la réservation' })
  @ApiResponse({
    status: 200,
    description: 'Réservation annulée, fonds débloqués',
  })
  @ApiResponse({ status: 404, description: 'Réservation introuvable' })
  @HttpCode(HttpStatus.OK)
  @Delete(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelReservationDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<ReservationSnapshot> {
    const reservation = await this.cancelReservation.execute(
      id,
      user.userId,
      false,
      dto.motif,
    );
    return reservation.snapshot();
  }

  @ApiOperation({ summary: 'Annuler une réservation (admin)' })
  @ApiParam({ name: 'id', description: 'UUID de la réservation' })
  @ApiResponse({ status: 200, description: 'Réservation annulée par admin' })
  @HttpCode(HttpStatus.OK)
  @Delete(':id/admin-cancel')
  @RequirePermission('reservations:manage')
  async adminCancel(
    @Param('id') id: string,
    @Body() dto: CancelReservationDto,
    @CurrentUser() user: ActiveUser,
  ): Promise<ReservationSnapshot> {
    const reservation = await this.cancelReservation.execute(
      id,
      user.userId,
      true,
      dto.motif,
    );
    return reservation.snapshot();
  }
}
