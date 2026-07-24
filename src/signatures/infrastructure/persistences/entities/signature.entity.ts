import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';

@Entity('signature')
export class SignatureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  youSignRequestId: string;

  @Column({ type: 'varchar' })
  youSignSignerId: string;

  @Column({ type: 'text', nullable: true })
  youSignSigningUrl: string | null;

  @Column({ type: 'uuid' })
  @Index()
  documentId: string;

  // Nullable — null quand l'investissement n'existe pas encore (cas B)
  @Column({ type: 'uuid', nullable: true })
  @Index()
  investmentId: string | null;

  // Contexte marché secondaire — pour que le webhook puisse finaliser la transaction
  @Column({ type: 'uuid', nullable: true })
  @Index()
  ordreId: string | null;

  @Column({ type: 'integer', nullable: true })
  nbFractions: number | null;

  @Column({ type: 'integer' })
  @Index()
  userId: number;

  @Column({ type: 'varchar', default: SignatureStatus.PENDING })
  statut: SignatureStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  signedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
