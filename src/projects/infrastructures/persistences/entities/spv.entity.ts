import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('spv')
export class SpvEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  raisonSociale: string;

  @Column({ type: 'varchar', nullable: true })
  siren: string | null;

  @Column({ type: 'varchar', nullable: true })
  forme: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  capitalSocial: number | null;

  @Column({ type: 'varchar', nullable: true })
  siegeAdresse: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  iban: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
