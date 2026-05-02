import { ReservationStatus } from './enums/reservation-status.enum';

export class Reservation {
  id: string;
  projetId: string;
  utilisateurId: number;
  montantReserve: number;
  rangFile: number | null;
  statut: ReservationStatus;
  confirmationJusquAu: Date | null;
  investissementId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
