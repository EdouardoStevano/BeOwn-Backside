import {
  Column,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEmailEntity } from './user-email.entity';
import { TFAMethodEntity } from './tfa-method.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn()
  userId: number;

  @Column({ nullable: true })
  firstname: string;

  @Column({ type: 'varchar', nullable: true })
  lastname: string | null;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  socialId: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  password: string | null;

  @OneToOne(() => UserEmailEntity, (email) => email.user, {
    cascade: true,
    eager: true,
  })
  userEmail: UserEmailEntity;

  @OneToMany(() => TFAMethodEntity, (method) => method.user)
  tfaMethods: TFAMethodEntity[];
}
