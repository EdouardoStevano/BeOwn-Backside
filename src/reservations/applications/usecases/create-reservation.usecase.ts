import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ReservationRepository } from '../ports/repositories/reservation.repository';
import { RESERVATION_REPOSITORY } from '../ports/repositories/reservation.repository';
import type { ProjectRepository } from 'src/catalog/domain/repositories/project.repository';
import { PROJECT_REPOSITORY } from 'src/catalog/domain/repositories/project.repository';
import { Reservation } from 'src/reservations/domains/reservation';
import { ReservationStatus } from 'src/reservations/domains/enums/reservation-status.enum';
import { CreateReservationDto } from 'src/reservations/presenters/dto/reservation.dto';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';

@Injectable()
export class CreateReservationUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(
    userId: number,
    dto: CreateReservationDto,
  ): Promise<Reservation> {
    const project = await this.projectRepository.findProjectById(dto.projetId);
    if (!project) throw new NotFoundException('Projet introuvable.');

    if (project.statut !== ProjectStatus.ANNONCE) {
      throw new BadRequestException(
        "Le pre-investissement n'est disponible que pour les projets en statut ANNONCE.",
      );
    }

    if (!project.estPreInvestissable) {
      throw new BadRequestException(
        'Ce projet ne permet pas le pré-investissement.',
      );
    }

    if (dto.montant < project.ticketMinimum) {
      throw new BadRequestException(
        `Le montant minimum est ${project.ticketMinimum} €.`,
      );
    }

    if (project.ticketMaximum && dto.montant > project.ticketMaximum) {
      throw new BadRequestException(
        `Le montant maximum est ${project.ticketMaximum} €.`,
      );
    }

    if (project.plafondPreInvestissement) {
      const totalReserve =
        await this.reservationRepository.countMontantReserveByProjet(
          dto.projetId,
        );
      if (totalReserve + dto.montant > project.plafondPreInvestissement) {
        throw new BadRequestException(
          'Le plafond de pré-investissement pour ce projet est atteint.',
        );
      }
    }

    const rang = await this.reservationRepository.getNextRangByProjet(
      dto.projetId,
    );

    const reservation = new Reservation();
    reservation.projetId = dto.projetId;
    reservation.utilisateurId = userId;
    reservation.montantReserve = dto.montant;
    reservation.rangFile = rang;
    reservation.statut = ReservationStatus.EN_ATTENTE;
    reservation.confirmationJusquAu = null;
    reservation.investissementId = null;

    return this.reservationRepository.save(reservation);
  }
}
