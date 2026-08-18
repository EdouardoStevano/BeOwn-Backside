import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_preferences')
export class UserPreferencesEntity {
  /**
   * Le titulaire des réglages, **par identité seule** : la relation vers
   * `UserEntity` n'était lue nulle part et faisait dépendre Preferences de
   * l'infrastructure d'IAM (§12.7). La clé étrangère en base ne bouge pas.
   */
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
}
