import {
  Reservation,
  ReservationNaissante,
} from '../../../domain/aggregates/reservation';
import { ReservationEntity } from '../entities/reservation.entity';

/**
 * Frontière entre le modèle de persistance et l'agrégat (§16) : l'entité
 * TypeORM ne sort jamais de l'infrastructure, l'agrégat n'y entre jamais.
 */
export class ReservationOrmMapper {
  static toDomain(this: void, entity: ReservationEntity): Reservation {
    return new Reservation({
      id: entity.id,
      projetId: entity.projetId,
      utilisateurId: entity.utilisateurId,
      // `decimal` Postgres arrive en string : le domaine parle en nombre.
      montantReserve: Number(entity.montantReserve),
      rangFile: entity.rangFile,
      statut: entity.statut,
      confirmationJusquAu: entity.confirmationJusquAu,
      investissementId: entity.investissementId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toEntity(reservation: Reservation): ReservationEntity {
    const etat = reservation.snapshot();
    const entity = new ReservationEntity();
    entity.id = etat.id;
    entity.projetId = etat.projetId;
    entity.utilisateurId = etat.utilisateurId;
    entity.montantReserve = etat.montantReserve;
    entity.rangFile = etat.rangFile;
    entity.statut = etat.statut;
    entity.confirmationJusquAu = etat.confirmationJusquAu;
    entity.investissementId = etat.investissementId;
    return entity;
  }

  /** Une réservation qui naît : pas encore d'identité ni de dates de vie. */
  static toNouvelleEntity(naissante: ReservationNaissante): ReservationEntity {
    const entity = new ReservationEntity();
    entity.projetId = naissante.projetId;
    entity.utilisateurId = naissante.utilisateurId;
    entity.montantReserve = naissante.montantReserve;
    entity.rangFile = naissante.rangFile;
    entity.statut = naissante.statut;
    entity.confirmationJusquAu = naissante.confirmationJusquAu;
    entity.investissementId = naissante.investissementId;
    return entity;
  }
}
