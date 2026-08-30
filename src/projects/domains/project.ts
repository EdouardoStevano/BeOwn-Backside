import type { ContenuFici } from './fici';
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
  /**
   * Dénomination sociale de la société support (SCI/SPV) émettrice — champ de
   * LECTURE seule, projeté depuis la relation `spv`. Le contrat de souscription
   * doit imprimer l'émetteur : `spvId` seul ne le permettait pas.
   * `null` quand le projet n'a pas de société support ou que la relation n'a
   * pas été chargée.
   */
  societeSupportNom: string | null;
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
  /** Échelle de risque 1 (très faible) à 5 (très élevé). */
  indiceRisque: number;
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
  /** Document d'informations clés de l'opération (voir `domains/fici.ts`). */
  fici: ContenuFici | null = null;
  previsionnel: PrevisionnelFinancier | null;
  chronologie: EtapeChronologie[];
  garanties: Garantie[];
  // Equity-locatif extension (Phase 1)
  modeleEconomique: ModeleEconomique;
  nbUnitesLouables: number | null;
  /** Horodatages anti-doublon des diffusions email/SMS (voir BroadcastService). */
  broadcastAnnonceAt: Date | null;
  broadcastCollecteAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
