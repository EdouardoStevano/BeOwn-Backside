import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum NewsStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity('news')
export class NewsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  @Index()
  slug: string;

  @Column({ type: 'varchar' })
  titreFr: string;

  @Column({ type: 'varchar', nullable: true })
  titreEn: string | null;

  @Column({ type: 'text' })
  contenuFr: string;

  @Column({ type: 'text', nullable: true })
  contenuEn: string | null;

  @Column({ type: 'text', nullable: true })
  resumeFr: string | null;

  @Column({ type: 'text', nullable: true })
  resumeEn: string | null;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'varchar', default: NewsStatus.DRAFT })
  @Index()
  statut: NewsStatus;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'integer', nullable: true })
  authorId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
