import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';

@Entity('user_preferences')
export class UserPreferencesEntity {
  @PrimaryColumn()
  userId: number;

  @Column({ default: 'fr' })
  langue: string;

  @Column({ default: false })
  masquerMontants: boolean;

  @Column({ default: true })
  notifEmail: boolean;

  @Column({ default: false })
  notifSms: boolean;

  @Column({ default: false })
  notifMarketing: boolean;

  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column({ default: 'EUR' })
  preferredCurrency: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
