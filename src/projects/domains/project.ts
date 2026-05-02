import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from './enums/project-status.enum';

export class Project {
  id: string;
  slug: string;
  titre: string;
  spvId: string | null;
  porteurId: number | null;
  type: ProjectType;
  ville: string | null;
  region: string | null;
  pays: string;
  capitalCible: number;
  capitalMinimum: number;
  ticketMinimum: number;
  ticketMaximum: number | null;
  triCible: number | null;
  dureeMois: number;
  instrument: ProjectInstrument;
  statut: ProjectStatus;
  estPreInvestissable: boolean;
  plafondPreInvestissement: number | null;
  datePublication: Date | null;
  dateOuvertureCollecte: Date | null;
  dateCloturePrevue: Date | null;
  descriptionMd: string | null;
  avertissementMd: string | null;
  createdAt: Date;
  updatedAt: Date;
}
