import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_log')
@Index('IDX_audit_log_acteurId_createdAt', ['acteurId', 'createdAt'])
@Index('IDX_audit_log_objetType_createdAt', ['objetType', 'createdAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true })
  acteurId: string | null;

  @Column({ type: 'varchar', nullable: true })
  role: string | null;

  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'varchar', nullable: true })
  objetType: string | null;

  /** Varchar (pas uuid) : l'intercepteur y écrit des params de route arbitraires (ids numériques inclus). */
  @Column({ type: 'varchar', nullable: true })
  objetId: string | null;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
