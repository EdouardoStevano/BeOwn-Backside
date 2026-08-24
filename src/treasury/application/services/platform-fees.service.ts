import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminSettingsEntity } from 'src/admin/entities/admin-settings.entity';
import { round2 } from 'src/shared/money/round2';

/**
 * Taux de commissions de la plateforme (en %, éditables par le super_admin
 * via les settings admin — voir AdminSettingsBlob.commissions).
 */
export interface PlatformFeeRates {
  /**
   * % par an du capital initial du SPV.
   *
   * @deprecated Plus aucun calcul ne l'utilise : il servait à la gestion
   * locative, sortie du périmètre (§1.4.3). La clé reste dans l'interface et
   * dans `DEFAULT_FEE_RATES` parce qu'elle est **stockée** en base
   * (`admin_settings.commissions`) et éditable par l'écran de paramétrage — la
   * retirer d'ici casserait la lecture des lignes existantes.
   */
  annualPlatformFeePct: number;
  /** @deprecated Idem : frais de gestion locative, hors périmètre. */
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
