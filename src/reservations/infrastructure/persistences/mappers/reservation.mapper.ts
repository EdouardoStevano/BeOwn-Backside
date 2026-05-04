import { Reservation } from 'src/reservations/domains/reservation';
import { ReservationEntity } from '../entities/reservation.entity';

export class ReservationMapper {
  static toDomain(this: void, entity: ReservationEntity): Reservation {
    const domain = new Reservation();
    domain.id = entity.id;
    domain.projetId = entity.projetId;
    domain.utilisateurId = entity.utilisateurId;
    domain.montantReserve = Number(entity.montantReserve);
    domain.rangFile = entity.rangFile;
    domain.statut = entity.statut;
    domain.confirmationJusquAu = entity.confirmationJusquAu;
    domain.investissementId = entity.investissementId;
    domain.createdAt = entity.createdAt;
    domain.updatedAt = entity.updatedAt;
    return domain;
  }

  static toEntity(domain: Reservation): ReservationEntity {
    const entity = new ReservationEntity();
    if (domain.id) entity.id = domain.id;
    entity.projetId = domain.projetId;
    entity.utilisateurId = domain.utilisateurId;
    entity.montantReserve = domain.montantReserve;
    entity.rangFile = domain.rangFile;
    entity.statut = domain.statut;
    entity.confirmationJusquAu = domain.confirmationJusquAu;
    entity.investissementId = domain.investissementId;
    return entity;
  }
}
