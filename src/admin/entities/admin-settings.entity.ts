import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export interface AdminSettingsBlob {
  platform?: {
    name?: string;
    contactEmail?: string;
    supportPhone?: string;
  };
  commissions?: {
    /** % par an du capital initial investi du SPV, prélevé 1/12 par mois sur les distributions */
    annualPlatformFeePct?: number;
    /** % des loyers encaissés, prélevé à chaque distribution */
    rentManagementFeePct?: number;
    /** % de la plus-value brute à la vente du bien (sortie) */
    propertySaleGainFeePct?: number;
    /** % du montant de la vente, à la charge du vendeur (marché secondaire) */
    resaleTransactionFeePct?: number;
    /** % de la plus-value du vendeur sur revente d'actions (marché secondaire) */
    shareSaleGainFeePct?: number;
  };
  kyc?: {
    provider?: string;
    minScoreAccepted?: number;
    autoApproveBelowAmount?: number;
  };
  notifications?: {
    defaultEmailFrom?: string;
    smsProvider?: 'twilio' | 'none';
    digestFrequency?: 'daily' | 'weekly' | 'monthly';
  };
  feature_flags?: {
    enableSecondaryMarket?: boolean;
    enableNews?: boolean;
    enable2FAEnforcement?: boolean;
    enableMultilingualContent?: boolean;
    psp_provider?: 'stripe' | 'lemonway' | 'mangopay' | 'none';
  };
}

/**
 * Singleton row (id = "default") storing admin-tunable platform settings.
 */
@Entity('admin_settings')
export class AdminSettingsEntity {
  @PrimaryColumn({ type: 'varchar', default: 'default' })
  id: string;

  @Column({ type: 'jsonb', default: {} })
  settings: AdminSettingsBlob;

  @UpdateDateColumn()
  updatedAt: Date;
}
