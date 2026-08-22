import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Check,
} from 'typeorm';

@Entity('avis')
@Check(`"note" >= 1 AND "note" <= 5`)
export class AvisEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  projetId: string;

  @Column({ type: 'int' })
  @Index()
  userId: number;

  @Column({ type: 'smallint' })
  note: number;

  @Column({ type: 'text', nullable: true })
  commentaire: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
