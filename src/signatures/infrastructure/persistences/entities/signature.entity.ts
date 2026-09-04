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

  // ── Provider de signature (port SignatureProvider) ─────────────────────────
  // `yousign` par défaut : toutes les lignes antérieures à l'introduction du
  // provider de repli ont été ouvertes chez YouSign.

  @Column({ type: 'varchar', default: 'yousign' })
  provider: string;

  /** Empreinte SHA-256 (hex) du PDF présenté au signataire — repli uniquement. */
  @Column({ type: 'varchar', nullable: true })
  documentHash: string | null;

  /** Horodatage SERVEUR de l'acceptation certifiée — repli uniquement. */
  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  /** Adresse IP du signataire au moment de l'acceptation — repli uniquement. */
  @Column({ type: 'varchar', nullable: true })
  acknowledgedIp: string | null;

  /** Certificat d'acceptation archivé (module documents) — repli uniquement. */
  @Column({ type: 'uuid', nullable: true })
  certificatDocumentId: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  signedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
