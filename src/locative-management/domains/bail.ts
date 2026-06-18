import { StatutBail } from './enums/statut-bail.enum';

export class Bail {
  id: string;
  uniteLouableId: string;
  locataireId: string;
  loyerMensuel: number;
  dateDebut: Date;
  dateFin: Date | null; // null = bail à durée indéterminée
  statut: StatutBail;
  contratPdfUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
