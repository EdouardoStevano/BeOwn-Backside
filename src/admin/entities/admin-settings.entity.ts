import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export interface AdminSettingsBlob {
  platform?: {
    name?: string;
    contactEmail?: string;
    supportPhone?: string;
    defaultCurrency?: string;
    timezone?: string;
  };
  commissions?: {
    investmentFeePct?: number;
    secondaryMarketFeePct?: number;
    earlyExitFeePct?: number;
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
