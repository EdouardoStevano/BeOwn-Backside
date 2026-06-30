/**
 * Commission de la plateforme sur chaque transaction du marché secondaire.
 * Prélevée sur le vendeur : il reçoit `montantTotal × (1 - rate)`, et la
 * plateforme encaisse `montantTotal × rate` sur le wallet FRAIS_PLATEFORME.
 *
 * L'UI admin affiche les commissions perçues sur la base du même taux —
 * voir BeOwn-Admin/src/pages/Market.tsx (`totalCommissions`).
 */
export const SECONDARY_MARKET_COMMISSION_RATE = 0.01; // 1 %

export const computeSecondaryMarketCommission = (montantTotal: number): number => {
  return Math.round(montantTotal * SECONDARY_MARKET_COMMISSION_RATE * 100) / 100;
};
