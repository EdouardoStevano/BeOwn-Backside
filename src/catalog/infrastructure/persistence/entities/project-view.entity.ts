import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Trace d'une consultation du détail d'un projet par un utilisateur
 * (investisseur). Sert à détecter la 2ᵉ consultation d'un même projet pour
 * alerter le chargé de relation (opportunité de contact).
 */
@Entity('project_view')
@Index('IDX_project_view_user_projet', ['userId', 'projetId'])
export class ProjectViewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  userId: number;

  @Column({ type: 'uuid' })
  projetId: string;

  @CreateDateColumn()
  createdAt: Date;
}
