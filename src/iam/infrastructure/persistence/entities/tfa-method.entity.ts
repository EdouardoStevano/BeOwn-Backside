import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  TableInheritance,
} from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';

/**
 * Racine de l'héritage table unique (STI) des méthodes de double
 * authentification.
 *
 * La relation vers `UserEntity` est volontairement **unidirectionnelle** : le
 * `@OneToMany tfaMethods` qui existait sur `UserEntity` n'était lu par
 * personne, mais était chargé à chaque lecture de compte. Les méthodes se
 * lisent par `TOTP_METHOD_REPOSITORY`. La clé étrangère reste portée par
 * `tfa_methods.user_id` — schéma inchangé, aucune migration.
 */
@Entity('tfa_methods')
@TableInheritance({ column: { type: 'varchar', name: 'type_method' } })
export abstract class TFAMethodEntity {
  @PrimaryGeneratedColumn()
  TFAMethodId: number;

  @Column()
  isActive: boolean;

  @CreateDateColumn()
  activatedDate: Date;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
