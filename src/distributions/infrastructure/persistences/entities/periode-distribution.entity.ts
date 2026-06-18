import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutPeriodeDistribution } from '../../../domains/enums/statut-periode-distribution.enum';

@Entity('periode_distribution')
@Index(['projetId', 'periode'], { unique: true })
export class PeriodeDistributionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  projetId: string;

  @Column({ type: 'varchar', length: 7 })
  periode: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalLoyers: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalCharges: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  revenuNet: number;

  @Column({ type: 'varchar', default: StatutPeriodeDistribution.CALCULEE })
  statut: StatutPeriodeDistribution;

  @Column({ type: 'timestamptz' })
  calculeeLe: Date;

  @Column({ type: 'timestamptz', nullable: true })
  valideeLe: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  distribueeLe: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
