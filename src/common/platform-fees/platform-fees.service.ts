import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminSettingsEntity } from 'src/admin/entities/admin-settings.entity';
import { round2 } from './platform-fees.constants';

/**
 * Taux de commissions de la plateforme (en %, éditables par le super_admin
 * via les settings admin — voir AdminSettingsBlob.commissions).
 */
export interface PlatformFeeRates {
  /** % par an du capital initial investi du SPV, prélevé 1/12 par mois sur les distributions */
  annualPlatformFeePct: number;
  /** % des loyers encaissés, prélevé à chaque distribution */
  rentManagementFeePct: number;
  /** % de la plus-value brute à la vente du bien (sortie) */
  propertySaleGainFeePct: number;
  /** % du montant de la vente, à la charge du vendeur (marché secondaire) */
  resaleTransactionFeePct: number;
  /** % de la plus-value du vendeur sur revente d'actions (marché secondaire) */
  shareSaleGainFeePct: number;
}

export const DEFAULT_FEE_RATES: PlatformFeeRates = {
  annualPlatformFeePct: 1,
  rentManagementFeePct: 7,
  propertySaleGainFeePct: 15,
  resaleTransactionFeePct: 1,
  shareSaleGainFeePct: 15,
};

/**
 * Service central de calcul des frais plateforme.
 *
 * Lit les taux dans la ligne singleton admin_settings (id = "default") et
 * retombe sur DEFAULT_FEE_RATES pour toute clé absente ou invalide.
 * Les clés legacy du blob (investmentFeePct…) sont simplement ignorées.
 */
@Injectable()
export class PlatformFeesService {
  constructor(
    @InjectRepository(AdminSettingsEntity)
    private readonly settingsRepo: Repository<AdminSettingsEntity>,
  ) {}

  async getRates(): Promise<PlatformFeeRates> {
    const row = await this.settingsRepo.findOne({ where: { id: 'default' } });
    const blob = row?.settings?.commissions ?? {};

    const pick = (key: keyof PlatformFeeRates): number => {
      const value = blob[key];
      return typeof value === 'number' && Number.isFinite(value)
        ? value
        : DEFAULT_FEE_RATES[key];
    };

    return {
      annualPlatformFeePct: pick('annualPlatformFeePct'),
      rentManagementFeePct: pick('rentManagementFeePct'),
      propertySaleGainFeePct: pick('propertySaleGainFeePct'),
      resaleTransactionFeePct: pick('resaleTransactionFeePct'),
      shareSaleGainFeePct: pick('shareSaleGainFeePct'),
    };
  }

  /**
   * Frais plateforme mensuel : capital initial × (taux annuel / 100) / 12.
   *
   * `rates` (optionnel) : snapshot de taux pré-lu via getRates(). Toute
   * opération métier appliquant PLUSIEURS frais doit lire les taux UNE fois
   * et passer ce snapshot à chaque helper (pas de dérive de taux en cours
   * d'opération si un admin modifie les commissions entre deux calculs).
   */
  async computeMonthlyPlatformFee(
    capitalInitial: number,
    rates?: PlatformFeeRates,
  ): Promise<number> {
    const r = rates ?? (await this.getRates());
    return round2((capitalInitial * (r.annualPlatformFeePct / 100)) / 12);
  }

  /**
   * Frais de gestion locative : loyers encaissés × taux / 100.
   * Pas de frais si aucun loyer encaissé.
   */
  async computeRentManagementFee(
    loyers: number,
    rates?: PlatformFeeRates,
  ): Promise<number> {
    if (loyers <= 0) return 0;
    const r = rates ?? (await this.getRates());
    return round2(loyers * (r.rentManagementFeePct / 100));
  }

  /**
   * Frais sur plus-value à la vente du bien (sortie).
   * Pas de frais sur une moins-value.
   */
  async computePropertySaleGainFee(
    plusValue: number,
    rates?: PlatformFeeRates,
  ): Promise<number> {
    if (plusValue <= 0) return 0;
    const r = rates ?? (await this.getRates());
    return round2(plusValue * (r.propertySaleGainFeePct / 100));
  }

  /**
   * Frais marché secondaire à la charge du vendeur :
   * - transactionFee : % du montant de la vente ;
   * - gainFee : % de la plus-value du vendeur (0 si pas de plus-value).
   */
  async computeResaleFees(
    montantVente: number,
    plusValueVendeur: number,
    ratesSnapshot?: PlatformFeeRates,
  ): Promise<{ transactionFee: number; gainFee: number }> {
    const rates = ratesSnapshot ?? (await this.getRates());
    return {
      transactionFee: round2(
        montantVente * (rates.resaleTransactionFeePct / 100),
      ),
      gainFee:
        plusValueVendeur <= 0
          ? 0
          : round2(plusValueVendeur * (rates.shareSaleGainFeePct / 100)),
    };
  }
}
