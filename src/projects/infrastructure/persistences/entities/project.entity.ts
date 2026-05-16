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
  @JoinColumn({ name: 'spv_id' })
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

  @Column({ type: 'jsonb', nullable: true })
  previsionnel: PrevisionnelFinancier | null;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  chronologie: EtapeChronologie[];

  @Column({ type: 'jsonb', nullable: true, default: [] })
  garanties: Garantie[];

  @Column({ type: 'jsonb', nullable: true, default: [] })
  echeancierEmprunteur: EcheanceEmprunteur[];

  @Column({ type: 'text', nullable: true })
  motifAnnulation: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  annuleLe: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
