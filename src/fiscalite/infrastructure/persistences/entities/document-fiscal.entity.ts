import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('document_fiscal')
@Index(['userId', 'annee'], { unique: true })
export class DocumentFiscalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  @Index()
  userId: number;

  @Column({ type: 'integer' })
  annee: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montantBrut: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montantIR: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montantCSG: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montantNet: number;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  pdfUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  genereeLe: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
