import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('distribution_part')
@Index(['periodeDistributionId', 'investissementId'], { unique: true })
export class DistributionPartEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  periodeDistributionId: string;

  @Column({ type: 'uuid' })
  @Index()
  investissementId: string;

  @Column({ type: 'decimal', precision: 10, scale: 8 }) // ex. 0.05000000 = 5 %
  pourcentageDetention: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montantBrut: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  prelevementIR: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  prelevementCSG: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montantNet: number;

  // Le suivi fiscal et les relances filtrent les parts payées (ou non) par
  // date de règlement : sans index, chaque lecture balaie toutes les parts de
  // toutes les périodes. Pose en base : hors déploiement, cf.
  // docs/adr/ADR-migrations-hors-deploiement.md.
  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  payeLe: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
