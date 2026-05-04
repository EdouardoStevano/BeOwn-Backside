import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  TableInheritance,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('tfa_methods')
@TableInheritance({ column: { type: 'varchar', name: 'type_method' } })
export abstract class TFAMethodEntity {
  @PrimaryGeneratedColumn()
  TFAMethodId: number;

  @Column()
  isActive: boolean;

  @CreateDateColumn()
  activatedDate: Date;

  @ManyToOne(() => UserEntity, (user) => user.tfaMethods)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
