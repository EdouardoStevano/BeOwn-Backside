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

  // Equity-locatif extension (Phase 1) — default OBLIGATAIRE pour rétrocompat
  @Column({ type: 'varchar', default: ModeleEconomique.OBLIGATAIRE })
  modeleEconomique: ModeleEconomique;

  @Column({ type: 'integer', nullable: true })
  nbUnitesLouables: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
