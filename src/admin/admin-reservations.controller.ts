import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsOptional, Min } from 'class-validator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { formatEur } from 'src/shared/money/format-eur';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { ReservationEntity } from 'src/reservations/infrastructure/persistences/entities/reservation.entity';
import { ReservationStatus } from 'src/reservations/domains/enums/reservation-status.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';

const ADMIN_ROLES: string[] = rolesWithPermission('reservations:manage');

class CreateReservationAdminDto {
  projectId: string;
  userId: string | number;
  montantReserve: number;
  visibleInJauge?: boolean;
  sendEmail?: boolean;
}

class UpdateReservationAdminDto {
  @IsOptional() @IsNumber() @Min(0) montantReserve?: number;
  @IsOptional() @IsNumber() @Min(0) rangFile?: number;
}

const mapStatus = (s: ReservationStatus): string => {
  switch (s) {
    case ReservationStatus.EN_ATTENTE:
      return 'creee';
    case ReservationStatus.VALIDEE:
      return 'signee';
    case ReservationStatus.CONVERTIE:
      return 'payee';
    case ReservationStatus.ANNULEE_USER:
    case ReservationStatus.ANNULEE_ADMIN:
      return 'annulee';
    case ReservationStatus.EXPIRE:
      return 'expiree';
    default:
      return s;
  }
};

@ApiTags('Admin – Reservations')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard)
@RequirePermission('reservations:manage')
export class AdminReservationsController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(ReservationEntity)
    private readonly reservationRepo: Repository<ReservationEntity>,
    private readonly notif: NotificationService,
  ) {}

  private async ensureAdmin(currentUser: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: currentUser.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role)) {
      throw new ForbiddenException("Accès réservé aux administrateurs.");
    }
  }

  @ApiOperation({ summary: 'Lister les réservations d\'un projet (admin)' })
  @Get('projects/:id/reservations')
  async byProject(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.ensureAdmin(user);
    const reservations = await this.reservationRepo.find({
      where: { projetId: id },
      relations: ['utilisateur'],
      order: { rangFile: 'ASC', createdAt: 'ASC' },
    });
    return reservations.map((r) => ({
      id: r.id,
      userId: String(r.utilisateurId),
      userName: r.utilisateur
        ? `${r.utilisateur.firstname ?? ''} ${r.utilisateur.lastname ?? ''}`.trim() || null
        : null,
      userEmail: (r.utilisateur as any)?.userEmail?.email ?? null,
      montantReserve: Number(r.montantReserve),
      rangFile: r.rangFile ?? 0,
      statut: mapStatus(r.statut),
      createdAt: r.createdAt,
      signedAt: r.statut === ReservationStatus.VALIDEE ? r.updatedAt : null,
      paidAt: r.statut === ReservationStatus.CONVERTIE ? r.updatedAt : null,
    }));
  }

  @ApiOperation({ summary: 'Créer une réservation pour un investisseur (admin)' })
  @Post('reservations')
  async create(
    @Body() dto: CreateReservationAdminDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.ensureAdmin(user);
    const project = await this.projectRepo.findOne({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');

    const userIdNum = Number(dto.userId);
    const targetUser = await this.userRepo.findOne({ where: { userId: userIdNum } });
    if (!targetUser) throw new NotFoundException('Investisseur introuvable.');

    // Compute next rang
    const existing = await this.reservationRepo.find({
      where: { projetId: dto.projectId },
      order: { rangFile: 'DESC' },
      take: 1,
    });
    const nextRang = (existing[0]?.rangFile ?? 0) + 1;

    const reservation = this.reservationRepo.create({
      projetId: dto.projectId,
      utilisateurId: userIdNum,
      montantReserve: dto.montantReserve,
      rangFile: nextRang,
      statut: ReservationStatus.EN_ATTENTE,
      confirmationJusquAu: null,
      investissementId: null,
    });
    const saved = await this.reservationRepo.save(reservation);

    if (dto.sendEmail) {
      try {
        await this.notif.push({
          utilisateurId: userIdNum,
          type: NotificationType.AUTRE,
          titre: `Réservation ouverte sur ${project.titre}`,
          message: `Un administrateur a initié une réservation de ${formatEur(dto.montantReserve)} sur le projet "${project.titre}". Finalisez votre investissement depuis votre espace.`,
          metadata: {
            projectId: project.id,
            projectSlug: project.slug,
            reservationId: saved.id,
            amount: dto.montantReserve,
          },
        });
      } catch {
        // non-blocking
      }
    }

    return { id: saved.id, rangFile: saved.rangFile };
  }

  @ApiOperation({ summary: 'Mettre à jour une réservation (admin)' })
  @Patch('reservations/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReservationAdminDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.ensureAdmin(user);
    const r = await this.reservationRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Réservation introuvable.');
    if (r.statut === ReservationStatus.CONVERTIE) {
      throw new ForbiddenException('Réservation déjà convertie en investissement.');
    }
    const patch: Partial<ReservationEntity> = {};
    if (dto.montantReserve !== undefined) patch.montantReserve = dto.montantReserve;
    if (dto.rangFile !== undefined) patch.rangFile = dto.rangFile;
    await this.reservationRepo.update({ id }, patch);
    return this.reservationRepo.findOneOrFail({ where: { id } });
  }

  @ApiOperation({ summary: 'Annuler une réservation (admin)' })
  @HttpCode(HttpStatus.OK)
  @Post('reservations/:id/cancel')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.ensureAdmin(user);
    const r = await this.reservationRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Réservation introuvable.');
    if ([ReservationStatus.CONVERTIE].includes(r.statut)) {
      throw new ForbiddenException('Réservation déjà convertie en investissement.');
    }
    await this.reservationRepo.update({ id }, { statut: ReservationStatus.ANNULEE_ADMIN });
    try {
      await this.notif.push({
        utilisateurId: r.utilisateurId,
        type: NotificationType.AUTRE,
        titre: 'Votre réservation a été annulée',
        message: `Votre réservation de ${formatEur(Number(r.montantReserve))} a été annulée par un administrateur.`,
      });
    } catch {}
    return { id, statut: 'annulee' };
  }

  @ApiOperation({ summary: 'Renvoyer un email de relance à l\'investisseur' })
  @Post('reservations/:id/send-email')
  @HttpCode(HttpStatus.OK)
  async sendEmail(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.ensureAdmin(user);
    const r = await this.reservationRepo.findOne({
      where: { id },
      relations: ['projet'],
    });
    if (!r) throw new NotFoundException('Réservation introuvable.');
    try {
      await this.notif.push({
        utilisateurId: r.utilisateurId,
        type: NotificationType.AUTRE,
        titre: `Rappel — Réservation sur ${r.projet?.titre ?? 'un projet'}`,
        message: `Pensez à finaliser votre réservation de ${formatEur(Number(r.montantReserve))}.`,
        metadata: { reservationId: id, projectId: r.projetId },
      });
    } catch {}
    return { id, sent: true };
  }

  @ApiOperation({ summary: 'Envoyer une demande de signature électronique' })
  @Post('reservations/:id/send-signature')
  @HttpCode(HttpStatus.OK)
  async sendSignature(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.ensureAdmin(user);
    const r = await this.reservationRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Réservation introuvable.');
    // TODO: branch on real e-signature provider (Yousign / DocuSign / Universign).
    // For now, mark as VALIDEE (signed) and notify.
    try {
      await this.notif.push({
        utilisateurId: r.utilisateurId,
        type: NotificationType.AUTRE,
        titre: 'Document à signer',
        message: 'Un document de réservation vous attend pour signature électronique.',
        metadata: { reservationId: id },
      });
    } catch {}
    return { id, signatureRequested: true };
  }
}
