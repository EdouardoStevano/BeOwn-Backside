import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';

export enum NotificationCanal {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  IN_APP = 'in_app',
}

@Entity('notification')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', nullable: true })
  @Index()
  utilisateurId: number | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'utilisateur_id' })
  utilisateur: UserEntity;

  @Column({ type: 'varchar', nullable: true })
  canal: NotificationCanal | null;

  @Column({ type: 'varchar', nullable: true })
  templateCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  statut: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  envoyeLe: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
