import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_log')
export class AuditLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid', nullable: true })
  acteurId: string | null;

  @Column({ type: 'varchar', nullable: true })
  role: string | null;

  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'varchar', nullable: true })
  objetType: string | null;

  @Column({ type: 'uuid', nullable: true })
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
