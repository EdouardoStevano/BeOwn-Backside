import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DocumentRelatedTo, DocumentType } from 'src/documents/domains/enums/document-type.enum';

@Entity('document')
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: DocumentType;

  @Column({ type: 'varchar' })
  relatedTo: DocumentRelatedTo;

  @Column({ type: 'int', nullable: true })
  @Index()
  userId: number | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  projectId: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  investmentId: string | null;

  @Column({ type: 'varchar' })
  originalName: string;

  @Column({ type: 'varchar' })
  filename: string;

  @Column({ type: 'varchar' })
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ type: 'varchar' })
  path: string;

  @Column({ type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ type: 'int' })
  uploadedBy: number;

  /** Position d'affichage (uniquement pour PHOTO_PROJET) */
  @Column({ type: 'int', nullable: true, default: null })
  ordre: number | null;

  /** Image de couverture principale du projet */
  @Column({ type: 'boolean', default: false })
  estPrincipale: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
