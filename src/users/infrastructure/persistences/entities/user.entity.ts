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
import {
  RegimeFiscal,
  UserRole,
  UserStatus,
  UserType,
} from 'src/users/domains/enums/user.enum';

// Ces enums appartiennent au domaine (src/users/domains/enums/user.enum.ts).
// On les ré-exporte ici pour ne pas casser les nombreux modules qui les
// importaient historiquement depuis l'entité ; le nouveau code doit importer
// depuis le domaine.
export { RegimeFiscal, UserRole, UserStatus, UserType };

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

  @Column({ type: 'varchar', nullable: true })
  userType: UserType | null;

  @Column({ type: 'varchar', default: RegimeFiscal.PFU })
  regimeFiscal: RegimeFiscal;

  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  tauxBaremeMarginal: number | null;

  @Column({ type: 'int', nullable: true })
  cgpId: number | null;

  @Column({ type: 'varchar', nullable: true, unique: true })
  cgpReferralCode: string | null;

  /**
   * PEP (Politically Exposed Person) — flag manuel posé par l'équipe
   * compliance après screening (vendor à brancher en Phase 10+).
   * Phase 10 stub : champ disponible, à activer via endpoint admin.
   */
  @Column({ type: 'boolean', default: false })
  pepFlagged: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  pepNote: string | null;

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
