import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';

@Entity('transaction_paiement')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  walletSource: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'wallet_source' })
  walletId: string | null;

  @Column({ type: 'uuid', nullable: true })
  walletDestination: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montant: number;

  @Column({ type: 'char', length: 3, default: 'XOF' })
  devise: string;

  @Column({ type: 'varchar' })
  type: TransactionType;

  @Column({ type: 'varchar', nullable: true })
  referenceExterne: string | null;

  @Column({ type: 'varchar', default: TransactionFournisseur.STRIPE })
  fournisseur: TransactionFournisseur;

  @Column({ type: 'varchar', nullable: true })
  fournisseurRef: string | null;

  @Column({ type: 'varchar', default: TransactionStatus.INITIE })
  statut: TransactionStatus;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  investissementId: string | null;

  @Column({ type: 'uuid', nullable: true })
  echeanceId: string | null;

  @Column({ type: 'uuid', nullable: true })
  reservationId: string | null;

  @Column({ type: 'uuid', nullable: true })
  projetId: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  fraisPsp: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  fraisPlateforme: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  motifEchec: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
