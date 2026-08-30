import { Injectable } from '@nestjs/common';
import {
  PlatformFeesService,
  PlatformFeeRates,
} from 'src/common/platform-fees/platform-fees.service';
import {
  AssietteCession,
  calculerAssietteCession,
} from 'src/secondarymarket/domains/tableau-affichage';

/**
 * Devis de frais d'une cession, tel qu'il est montré AVANT tout engagement.
 *
 * Les frais du marché secondaire sont à la charge du vendeur : `aLaChargeDe`
 * est explicite pour qu'aucune interface ne puisse les présenter comme une
 * ponction sur l'acheteur.
 */
export interface DevisCession {
  /** Montant de la cession, avant frais. */
  montantBrut: number;
  /** Plus-value du vendeur retenue comme assiette (0 si moins-value). */
  plusValueVendeur: number;
  /** Frais de transaction : % du montant de la cession. */
  fraisTransaction: number;
  /** Frais sur plus-value : % du gain du vendeur. */
  fraisPlusValue: number;
  totalFrais: number;
  /** Ce que le vendeur perçoit réellement, frais déduits. */
  netVendeur: number;
  aLaChargeDe: 'vendeur';
  /** Taux appliqués, pour que l'interface n'ait aucun taux en dur. */
  tauxTransactionPct: number;
  tauxPlusValuePct: number;
}

const arrondi2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Traduit une assiette de cession en devis chiffré.
 *
 * Une seule raison de changer : la façon dont un devis est composé. Les TAUX
 * ne vivent pas ici — ils sont administrables et lus via `PlatformFeesService`,
 * jamais écrits en dur.
 *
 * `chargerTaux()` est exposé pour que les listes d'ordres lisent la grille UNE
 * fois et la passent à chaque devis : sans cela, afficher N annonces
 * déclencherait N lectures de `admin_settings`, et une modification de la
 * grille en cours de page produirait des lignes calculées sur deux grilles
 * différentes.
 */
@Injectable()
export class DevisCessionService {
  constructor(private readonly platformFees: PlatformFeesService) {}

  chargerTaux(): Promise<PlatformFeeRates> {
    return this.platformFees.getRates();
  }

  async calculer(
    assiette: AssietteCession,
    tauxSnapshot?: PlatformFeeRates,
  ): Promise<DevisCession> {
    const taux = tauxSnapshot ?? (await this.chargerTaux());
    const base = calculerAssietteCession(assiette);

    const { transactionFee, gainFee } = await this.platformFees.computeResaleFees(
      base.montantBrut,
      base.plusValueVendeur,
      taux,
    );

    const totalFrais = arrondi2(transactionFee + gainFee);

    return {
      montantBrut: base.montantBrut,
      plusValueVendeur: base.plusValueVendeur,
      fraisTransaction: transactionFee,
      fraisPlusValue: gainFee,
      totalFrais,
      netVendeur: arrondi2(base.montantBrut - totalFrais),
      aLaChargeDe: 'vendeur',
      tauxTransactionPct: taux.resaleTransactionFeePct,
      tauxPlusValuePct: taux.shareSaleGainFeePct,
    };
  }
}
