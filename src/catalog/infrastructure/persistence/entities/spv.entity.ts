import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RegimeFiscal } from '../../../domain/enums/regime-fiscal.enum';

@Entity('spv')
export class SpvEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  raisonSociale: string;

  @Column({ type: 'varchar', nullable: true })
  siren: string | null;

  @Column({ type: 'varchar', nullable: true })
  forme: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  capitalSocial: number | null;

  @Column({ type: 'varchar', nullable: true })
  siegeAdresse: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  iban: string | null;

  // Champs equity-locatif (Phase 1)
  @Column({ type: 'date', nullable: true })
  dateConstitution: Date | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  statutsPdfUrl: string | null;

  @Column({ type: 'varchar', default: RegimeFiscal.IS })
  regimeFiscal: RegimeFiscal;

  @Column({ type: 'integer', nullable: true })
  @Index()
  gestionnaireUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
