import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEmailEntity } from './user-email.entity';
import { TFAMethodEntity } from './tfa-method.entity';

export enum UserRole {
  INVESTISSEUR = 'investisseur',
  PORTEUR = 'porteur',
  ADMIN = 'admin',
  SUPPORT = 'support',
  COMPLIANCE = 'compliance',
  DPO = 'dpo',
  RCCI = 'rcci',
  FINANCIER = 'financier',
}

export enum UserStatus {
  CREE = 'cree',
  EMAIL_VERIFIE = 'email_verifie',
  ACTIF = 'actif',
  SUSPENDU = 'suspendu',
  CLOS = 'clos',
  SUPPRIME = 'supprime',
}

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

  @Column({ type: 'varchar', default: UserRole.INVESTISSEUR })
  role: UserRole;

  @Column({ type: 'varchar', default: UserStatus.CREE })
  status: UserStatus;

  @Column({ type: 'timestamp', nullable: true })
  cguAccepteesLe: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => UserEmailEntity, (email) => email.user, {
    cascade: true,
    eager: true,
  })
  userEmail: UserEmailEntity;

  @OneToMany(() => TFAMethodEntity, (method) => method.user)
  tfaMethods: TFAMethodEntity[];
}
