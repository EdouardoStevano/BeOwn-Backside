import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutDeclaration } from '../../../domains/enums/statut-declaration.enum';

@Entity('loyer_encaisse')
@Index(['bailId', 'periode'], { unique: true }) // un seul loyer déclaré par bail/période
export class LoyerEncaisseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  bailId: string;

  @Column({ type: 'varchar', length: 7 }) // 'YYYY-MM'
  periode: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montant: number;

  @Column({ type: 'date' })
  dateEncaissement: Date;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  preuves: string[];

  @Column({ type: 'varchar', default: StatutDeclaration.DECLARE })
  statut: StatutDeclaration;

  @Column({ type: 'integer' })
  declareParUserId: number;

  @Column({ type: 'integer', nullable: true })
  valideParUserId: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  valideLe: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  motifRejet: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
