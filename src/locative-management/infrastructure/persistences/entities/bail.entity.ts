import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutBail } from '../../../domains/enums/statut-bail.enum';

@Entity('bail')
export class BailEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  uniteLouableId: string;

  @Column({ type: 'uuid' })
  @Index()
  locataireId: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  loyerMensuel: number;

  @Column({ type: 'date' })
  dateDebut: Date;

  @Column({ type: 'date', nullable: true })
  dateFin: Date | null;

  @Column({ type: 'varchar', default: StatutBail.ACTIF })
  statut: StatutBail;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  contratPdfUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
