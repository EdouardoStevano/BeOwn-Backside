import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TypePieceJustificative } from 'src/compliance/domain/enums/type-piece-justificative.enum';
import { StatutPiece } from 'src/compliance/domain/value-objects/decision-piece.vo';
import { ProfilPMEntity } from './profil-pm.entity';

/**
 * Une pièce justificative déposée à l'appui d'un dossier personne morale.
 *
 * **Rattachée à la société, pas au compte**, contrairement à la table
 * `document` du contexte `documents` qui ne connaît qu'un `userId`. Depuis
 * qu'un compte peut déclarer plusieurs sociétés, un KBIS rattaché au titulaire
 * ne désignerait plus une entreprise mais un ensemble — on ne saurait pas de
 * laquelle il est l'extrait.
 *
 * Les octets ne sont pas ici : `cleStockage` les retrouve dans le magasin de
 * fichiers, atteint par le port du contexte (§20). La table ne garde que ce
 * qu'il faut pour instruire et pour rendre le fichier.
 */
@Entity('piece_justificative')
@Unique('UQ_piece_societe_type_beneficiaire', [
  'societeId',
  'type',
  'beneficiaireId',
])
export class PieceJustificativeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  societeId: string;

  @ManyToOne(() => ProfilPMEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'societeId' })
  societe: ProfilPMEntity;

  @Column({ type: 'varchar' })
  type: TypePieceJustificative;

  /**
   * Le bénéficiaire effectif documenté, `null` pour une pièce de la société.
   *
   * Il entre dans la contrainte d'unicité : c'est ce qui autorise autant de
   * pièces d'identité que de bénéficiaires tout en n'admettant qu'un KBIS.
   *
   * ⚠️ En Postgres, `NULL` n'est jamais égal à `NULL` dans un index unique — la
   * contrainte ne protège donc pas les lignes de société à elle seule. Un index
   * partiel s'en charge, posé par la migration : voir
   * `PiecesJustificativesDuDossierMoral1784300000000`.
   */
  @Column({ type: 'uuid', nullable: true })
  beneficiaireId: string | null;

  // ── Le fichier déposé ───────────────────────────────────────────────────

  @Column({ type: 'varchar' })
  nomOrigine: string;

  /** Clé dans le magasin de fichiers — ce qui permet de relire les octets. */
  @Column({ type: 'varchar' })
  cleStockage: string;

  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'varchar' })
  mimeType: string;

  @Column({ type: 'int' })
  tailleOctets: number;

  /** Date d'émission du document, `null` quand elle n'est pas exigée. */
  @Column({ type: 'date', nullable: true })
  dateEmission: Date | null;

  // ── L'instruction ───────────────────────────────────────────────────────

  @Column({ type: 'varchar', default: StatutPiece.EN_ATTENTE })
  @Index()
  statut: StatutPiece;

  @Column({ type: 'varchar', length: 500, nullable: true })
  motifRefus: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decideeLe: Date | null;

  @Column({ type: 'timestamptz' })
  deposeeLe: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
