import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';

// Le vocabulaire du compte vit dans le domaine (iam/domains/enums/user.enum.ts).
// Ce fichier ne fait que le consommer pour typer ses colonnes.
import {
  RegimeFiscal,
  UserRole,
  UserStatus,
  UserType,
} from 'src/iam/domains/enums/user.enum';

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

  // ─── Stripe Connect Express (E3 — retrait) ────────────────────────────────
  // Identifiant du compte Stripe Connect Express de l'investisseur (acct_xxx),
  // créé au premier onboarding. Sert de destination aux Transfer/Payout lors
  // d'un retrait. Nullable (créé à la demande), unique. Champ ajouté via le
  // synchronize du seed (pas de migration — cf. MEMORY schéma dev).
  @Column({ type: 'varchar', nullable: true, unique: true })
  stripeConnectAccountId: string | null;

  // Drapeaux d'état du compte connecté, rafraîchis par le webhook
  // `account.updated` et par GET /payments/connect/status. `payoutsEnabled`
  // est le garde-fou du retrait (un retrait n'est possible que si true).
  @Column({ type: 'boolean', default: false })
  stripeConnectPayoutsEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  stripeConnectChargesEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  stripeConnectDetailsSubmitted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => UserEmailEntity, (email) => email.user, {
    cascade: true,
    eager: true,
  })
  userEmail: UserEmailEntity;

  // Les méthodes 2FA appartiennent à IAM (`iam/infrastructure/persistence/
  // entities/tfa-method.entity.ts`) et pointent vers ce compte par un
  // `@ManyToOne` unidirectionnel. Le `@OneToMany tfaMethods` qui était ici
  // n'était lu par personne et forçait users à connaître les entités d'IAM.
}
