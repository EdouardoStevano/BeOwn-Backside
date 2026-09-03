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
} from 'src/catalog/domain/enums/project-status.enum';
import { ModeleEconomique } from 'src/catalog/domain/enums/modele-economique.enum';
// Les formes des colonnes `jsonb` étaient déclarées ici, et le domaine les
// importait depuis cette entité — la flèche de dépendance allait à l'envers
// (§1). Elles vivent maintenant sous `domains/value-objects/`, et c'est
// l'infrastructure qui les emprunte pour typer ses colonnes.
import type { BlocDeContenuSnapshot } from 'src/catalog/domain/entities/bloc-de-contenu';
import type { PhotoProjetSnapshot } from 'src/catalog/domain/entities/photo-projet';
import type { EcheanceEmprunteur } from 'src/catalog/domain/value-objects/echeance-emprunteur.vo';
import type { EtapeChronologie } from 'src/catalog/domain/value-objects/chronologie.vo';
import type { Garantie } from 'src/catalog/domain/value-objects/garantie.vo';
import type { PrevisionnelFinancier } from 'src/catalog/domain/value-objects/previsionnel-financier.vo';

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

  /** Accroche de la fiche, affichée en liste et en partage. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  descriptionCourte: string | null;

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

  /**
   * Les pavés éditoriaux de la fiche, dans l'ordre.
   *
   * En `jsonb` et non dans une table fille : ce sont des entités *internes* à
   * l'agrégat projet (§6.1), qui ne se chargent ni ne se cherchent jamais
   * seules, et dont l'invariant de position porte sur la suite entière. Les
   * garder dans la ligne du projet fait de leur écriture la **même**
   * transaction que celle de l'agrégat (§17) — c'est exactement ce que la table
   * `document` ne permettait pas pour les photos.
   */
  @Column({ type: 'jsonb', nullable: true, default: [] })
  blocsDeContenu: BlocDeContenuSnapshot[];

  /** La galerie du projet. Même raisonnement que `blocsDeContenu`. */
  @Column({ type: 'jsonb', nullable: true, default: [] })
  photos: PhotoProjetSnapshot[];

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
