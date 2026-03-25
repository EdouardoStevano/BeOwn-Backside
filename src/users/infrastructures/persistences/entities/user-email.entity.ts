import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('user_emails')
export class UserEmailEntity {
  @PrimaryGeneratedColumn()
  userId: number;

  @Column()
  email: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedDate: Date | null;

  @OneToOne(() => UserEntity, (user) => user.userEmail)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
