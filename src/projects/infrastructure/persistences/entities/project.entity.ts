import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SpvEntity } from './spv.entity';
import {
  ProjectInstrument,
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';
import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import type { ContenuFici } from 'src/projects/domains/fici';

export interface PrevisionnelFinancier {
  operation: {
    acquisition: number;
    fraisNotaire: number;
    travaux: number;
    sequestre: number;
    fraisHypotheque: number;
    fraisFinanciers: number;
    autresCharges?: number;
  };
  financement: {
    apport: number;
    financementBancaire: number;
    montantInvestisseurs: number;
  };
  resultat: {
    montantRevente: number;
    coutOperation: number;
  };
}

export interface EtapeChronologie {
  etape: string;
  date: string;
  statut: 'done' | 'in_progress' | 'pending';
  description?: string;
}

export interface Garantie {
  type: string;
  description?: string;
  rang?: number;
}

/**
 * Borrower-side schedule defined by admin on the project itself. Investor-side
 * schedules (EcheanceEntity) are derived from this on a per-investment prorata.
 */
export interface EcheanceEmprunteur {
  id?: string;
  numero: number;
  datePrevue: string; // ISO date (YYYY-MM-DD)
  montantCapital: number;
  montantInterets: number;
  montantFraisPlateforme: number;
  montantFraisRetard: number;
  tauxInteretsAnnuel: number;
  tauxRetardAnnuel: number;
  capitalRestantAvant?: number;
  capitalRestantApres?: number;
  montantTotal?: number;
  statut: 'a_venir' | 'verifiee' | 'en_paiement' | 'payee' | 'retard';
}

@Entity('projet')
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  slug: string;

  @Column({ type: 'varchar' })
  titre: string;

  @Column({ type: 'uuid', nullable: true })
  spvId: string | null;

  @ManyToOne(() => SpvEntity, { nullable: true })
  @JoinColumn({ name: 'spvId' })
  spv: SpvEntity;

  @Column({ type: 'integer', nullable: true })
  porteurId: number | null;

  @Column({ type: 'varchar' })
  type: ProjectType;

  @Column({ type: 'varchar', nullable: true })
  ville: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ type: 'char', length: 2, default: 'FR' })
  pays: string;

  @Column({ type: 'varchar', nullable: true })
  adresseComplete: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ type: 'varchar', nullable: true })
  youtubeUrl: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  capitalCible: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  capitalMinimum: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 100 })
  ticketMinimum: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  ticketMaximum: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  triCible: number | null;

  /** Échelle de risque du projet (1 = très faible … 5 = très élevé), fixée par l'admin lors de l'analyse. */
  @Column({ type: 'integer', default: 3 })
  indiceRisque: number;

  @Column({ type: 'integer' })
  dureeMois: number;

  @Column({ type: 'varchar' })
  instrument: ProjectInstrument;

  @Column({ type: 'varchar', default: ProjectStatus.BROUILLON })
  @Index()
  statut: ProjectStatus;

  @Column({ default: false })
  estPreInvestissable: boolean;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  plafondPreInvestissement: number | null;

  /** Nombre total de fractions d'actif disponibles */
  @Column({ type: 'integer', nullable: true })
  nbFractions: number | null;

  /** Prix unitaire d'une fraction */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  prixFraction: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  datePublication: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dateOuvertureCollecte: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dateCloturePrevue: Date | null;

  @Column({ type: 'text', nullable: true })
  descriptionMd: string | null;

  @Column({ type: 'text', nullable: true })
  avertissementMd: string | null;

  /**
   * Fiche d'informations clés sur l'investissement (art. 23 du règlement
   * (UE) 2020/1503). Rédigée par le porteur, sous sa responsabilité. Aucune
   * collecte ne peut s'ouvrir tant qu'elle est incomplète.
   */
  @Column({ type: 'jsonb', nullable: true })
  fici: ContenuFici | null;

  @Column({ type: 'jsonb', nullable: true })
  previsionnel: PrevisionnelFinancier | null;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  chronologie: EtapeChronologie[];

  @Column({ type: 'jsonb', nullable: true, default: [] })
  garanties: Garantie[];

  @Column({ type: 'jsonb', nullable: true, default: [] })
  echeancierEmprunteur: EcheanceEmprunteur[];

  // Equity-locatif extension (Phase 1) — default OBLIGATAIRE pour rétrocompat
  @Column({ type: 'varchar', default: ModeleEconomique.OBLIGATAIRE })
  modeleEconomique: ModeleEconomique;

  @Column({ type: 'integer', nullable: true })
  nbUnitesLouables: number | null;

  @Column({ type: 'text', nullable: true })
  motifAnnulation: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  annuleLe: Date | null;

  /**
   * Horodatages anti-doublon des diffusions (BroadcastService) : posés AVANT
   * les envois, ils garantissent qu'une campagne « ouverture de réservation »
   * (passage en annonce) et « nouveau projet » (passage en collecte) ne partent
   * qu'une seule fois par projet, même si l'action admin est rejouée ou
   * appelée deux fois en parallèle.
   */
  @Column({ type: 'timestamptz', nullable: true })
  broadcastAnnonceAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  broadcastCollecteAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
