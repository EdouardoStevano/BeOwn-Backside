import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from './enums/project-status.enum';
import { ModeleEconomique } from './enums/modele-economique.enum';
import type {
  EtapeChronologie,
  Garantie,
  PrevisionnelFinancier,
} from 'src/projects/infrastructure/persistences/entities/project.entity';

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
  adresseComplete: string | null;
  latitude: number | null;
  longitude: number | null;
  youtubeUrl: string | null;
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
  nbFractions: number | null;
  prixFraction: number | null;
  datePublication: Date | null;
  dateOuvertureCollecte: Date | null;
  dateCloturePrevue: Date | null;
  descriptionMd: string | null;
  avertissementMd: string | null;
  previsionnel: PrevisionnelFinancier | null;
  chronologie: EtapeChronologie[];
  garanties: Garantie[];
  // Equity-locatif extension (Phase 1)
  modeleEconomique: ModeleEconomique;
  nbUnitesLouables: number | null;
  createdAt: Date;
  updatedAt: Date;
}
