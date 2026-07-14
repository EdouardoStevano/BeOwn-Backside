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

  /**
   * La clé étrangère, exposée comme colonne : elle permet d'écrire une méthode
   * sans avoir à charger l'agrégat User entier pour peupler la relation.
   */
  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => UserEntity, (user) => user.tfaMethods)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
