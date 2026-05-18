import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InvestmentEntity } from './investment.entity';
import { EcheanceStatus } from 'src/investments/domains/enums/investment-status.enum';

@Entity('echeance')
export class EcheanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  investissementId: string;

  @ManyToOne(() => InvestmentEntity, (i) => i.echeances)
  @JoinColumn({ name: 'investissement_id' })
  investissement: InvestmentEntity;

  @Column({ type: 'integer' })
  numero: number;

  @Column({ type: 'date' })
  datePrevue: Date;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  montantCapital: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  montantInterets: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  montantTotal: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  prelevementIR: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  prelevementCSG: number;

  @Column({ type: 'varchar', default: EcheanceStatus.A_VENIR })
  statut: EcheanceStatus;

  @Column({ type: 'timestamptz', nullable: true })
  payeLe: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  statutChangeLe: Date | null;

  @Column({ type: 'boolean', default: false })
  rappelJ7Envoye: boolean;

  @Column({ type: 'boolean', default: false })
  rappelJ1Envoye: boolean;
}
