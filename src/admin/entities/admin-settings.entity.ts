import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Canaux activables pour une campagne de diffusion (BroadcastService). */
export interface BroadcastChannelToggles {
  email: boolean;
  sms: boolean;
}

/** Toggles de diffusion par événement, éditables par l'admin. */
export interface BroadcastSettings {
  /** Projet passé en collecte — email « nouveau projet ». */
  nouveauProjet: BroadcastChannelToggles;
  /** Projet passé en annonce — email « ouverture de réservation ». */
  ouvertureReservation: BroadcastChannelToggles;
}

export type BroadcastSettingsPatch = {
  [K in keyof BroadcastSettings]?: Partial<BroadcastChannelToggles>;
};

/**
 * SMS à OFF par défaut : chaque SMS de diffusion est facturé par Twilio et
 * part à toute la base — l'activation doit être un geste explicite de l'admin.
 */
export const DEFAULT_BROADCAST_SETTINGS: BroadcastSettings = {
  nouveauProjet: { email: true, sms: false },
  ouvertureReservation: { email: true, sms: false },
};

const BROADCAST_EVENTS = [
  'nouveauProjet',
  'ouvertureReservation',
] as const satisfies readonly (keyof BroadcastSettings)[];

/**
 * Fusionne les toggles stockés avec les défauts, clé par clé (même hygiène
 * anti-legacy que mergeCommissions/mergePlatform) : une valeur non booléenne
 * ou une clé inconnue en base est ignorée au profit du défaut. Source unique
 * de vérité partagée par l'API admin (lecture/PATCH) et par BroadcastService.
 */
export function mergeBroadcastSettings(
  stored?: BroadcastSettingsPatch | null,
): BroadcastSettings {
  const out = {} as BroadcastSettings;
  for (const event of BROADCAST_EVENTS) {
    const patch = stored?.[event] ?? {};
    const defaults = DEFAULT_BROADCAST_SETTINGS[event];
    out[event] = {
      email:
        typeof patch.email === 'boolean' ? patch.email : defaults.email,
      sms: typeof patch.sms === 'boolean' ? patch.sms : defaults.sms,
    };
  }
  return out;
}

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
  notifications?: {
    defaultEmailFrom?: string;
    digestFrequency?: 'daily' | 'weekly' | 'monthly';
    /** Diffusions de masse : canaux activés par événement (voir BroadcastService). */
    broadcast?: BroadcastSettingsPatch;
  };
  feature_flags?: {
    enableSecondaryMarket?: boolean;
    enableNews?: boolean;
    enable2FAEnforcement?: boolean;
    enableMultilingualContent?: boolean;
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
