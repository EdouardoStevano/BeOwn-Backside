/**
 * Sources de revenus de la plateforme BeOwn (équivalent à modèle économique).
 *
 * Toutes les valeurs sont des taux décimaux (0.01 = 1 %). Centralisées ici
 * pour faciliter audit, modification et configuration future via env.
 *
 * Phase 9 du roadmap equity locatif.
 */

/**
 * Frais d'entrée prélevés à la souscription d'un investissement.
 * Appliqué au moment où la signature est confirmée et le wallet débité.
 * Imputation : ajouté au montant prélevé sur le wallet investisseur,
 * crédité sur FRAIS_PLATEFORME.
 */
export const PLATFORM_ENTRY_FEE_RATE = 0.02; // 2 %

/**
 * Commission de gestion annuelle, prélevée mensuellement sur le revenu net
 * de chaque période de distribution AVANT calcul des parts investisseurs.
 *
 * Mensuel = annuel / 12.
 */
export const PLATFORM_MANAGEMENT_FEE_ANNUAL_RATE = 0.01; // 1 % / an
export const PLATFORM_MANAGEMENT_FEE_MONTHLY_RATE =
  PLATFORM_MANAGEMENT_FEE_ANNUAL_RATE / 12;

/**
 * Performance fee — pourcentage de la plus-value brute prélevé par la plateforme
 * à la sortie d'un projet, AVANT distribution aux investisseurs. Appliqué
 * uniquement si plusValueBrute > 0.
 */
export const PLATFORM_PERFORMANCE_FEE_RATE = 0.1; // 10 % de la PV

/**
 * Commission marché secondaire (déjà appliquée — voir
 * src/secondarymarket/domains/commission.ts).
 */
export const PLATFORM_SECONDARY_MARKET_FEE_RATE = 0.01; // 1 %

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const computeEntryFee = (montantInvesti: number): number =>
  round2(montantInvesti * PLATFORM_ENTRY_FEE_RATE);

export const computeMonthlyManagementFee = (revenuNet: number): number => {
  // Pas de frais sur un mois déficitaire
  if (revenuNet <= 0) return 0;
  return round2(revenuNet * PLATFORM_MANAGEMENT_FEE_MONTHLY_RATE);
};

export const computePerformanceFee = (plusValueBrute: number): number => {
  if (plusValueBrute <= 0) return 0;
  return round2(plusValueBrute * PLATFORM_PERFORMANCE_FEE_RATE);
};
