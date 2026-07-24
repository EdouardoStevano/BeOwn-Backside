import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('unite_louable')
export class UniteLouableEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  projetId: string;

  @Column({ type: 'varchar', length: 100 })
  reference: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  surfaceM2: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  loyerMensuelCible: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
