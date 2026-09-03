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

  // ─── Réinvestissement automatique des loyers (vague C) ──────────────────
  // Opt-in explicite : à chaque distribution, le net crédité est réinvesti en
  // fractions ENTIÈRES du projet cible s'il est en collecte — le reliquat
  // reste au wallet. L'exécution vit dans ExecuteDistributionUseCase et passe
  // par CreateInvestmentUseCase (toutes les gardes KYC/art. 21 s'appliquent).
  @Column({ default: false })
  reinvestLoyers: boolean;

  @Column({ type: 'uuid', nullable: true })
  reinvestProjetId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
