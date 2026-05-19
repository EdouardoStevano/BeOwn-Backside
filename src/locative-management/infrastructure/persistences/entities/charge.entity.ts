import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutDeclaration } from '../../../domains/enums/statut-declaration.enum';
import { TypeCharge } from '../../../domains/enums/type-charge.enum';

@Entity('charge')
@Index(['projetId', 'periode'])
export class ChargeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  projetId: string;

  @Column({ type: 'varchar' })
  type: TypeCharge;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montant: number;

  @Column({ type: 'varchar', length: 7 })
  periode: string;

  @Column({ type: 'date' })
  dateOperation: Date;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  justificatifs: string[];

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
