import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { ReservationStatus } from 'src/reservations/domains/enums/reservation-status.enum';

@Entity('reservation')
export class ReservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  projetId: string;

  @ManyToOne(() => ProjectEntity)
  @JoinColumn({ name: 'projet_id' })
  projet: ProjectEntity;

  @Column({ type: 'integer' })
  @Index()
  utilisateurId: number;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'utilisateur_id' })
  utilisateur: UserEntity;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montantReserve: number;

  @Column({ type: 'integer', nullable: true })
  rangFile: number | null;

  @Column({ type: 'varchar', default: ReservationStatus.EN_ATTENTE })
  statut: ReservationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  confirmationJusquAu: Date | null;

  @Column({ type: 'uuid', nullable: true })
  investissementId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
