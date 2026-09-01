/**
 * PORT « solde du compte plateforme chez le prestataire de paiement » (DIP).
 *
 * Pourquoi un port plutôt qu'un appel direct au SDK Stripe depuis le service
 * de réconciliation :
 *
 *  1. TESTABILITÉ — la réconciliation est une règle de contrôle financier ;
 *     elle doit se vérifier SANS réseau ni clé d'API. Un double en mémoire
 *     suffit à couvrir le cas nominal, le cas « écart hors tolérance » et le
 *     cas « prestataire injoignable » (cf. reconciliation.service.spec.ts).
 *
 *  2. SUBSTITUABILITÉ RÉELLE — le PSP n'est pas une constante du produit :
 *     changer de prestataire (ou en cumuler deux) ne doit toucher QUE
 *     l'adaptateur d'infrastructure et la ligne de câblage du module, jamais
 *     la règle de rapprochement. Le besoin de substitution est ici avéré, pas
 *     spéculatif.
 *
 *  3. SENS DE DÉPENDANCE — la couche `applications` ne doit importer aucun SDK.
 *     C'est `infrastructure/stripe-plateforme-balance.adapter.ts` qui connaît
 *     Stripe ; l'application ne connaît que ce contrat.
 *
 * `abstract class` (et non `interface` TS) pour servir À LA FOIS d'abstraction
 * et de token d'injection Nest — convention déjà en place dans le dépôt
 * (`MetricsPort`, `ConnectAccountReader`, `PayoutMethodsReader`).
 *
 * ISP : port de LECTURE SEULE. La réconciliation observe, elle ne bouge aucun
 * fonds ; aucun appelant ne doit pouvoir déclencher un virement via ce contrat.
 */

export interface SoldePlateforme {
  /** Solde disponible + en attente, en EUR (unité majeure). */
  totalEur: number;
  devise: string;
}

export abstract class PlateformeBalanceReader {
  /**
   * Solde du compte plateforme chez le prestataire.
   *
   * Contrat : rejette si le prestataire est injoignable. L'appelant DOIT
   * traiter ce rejet — l'indisponibilité du PSP ne doit pas faire échouer la
   * réconciliation du grand livre interne, qui a de la valeur à elle seule.
   */
  abstract lireSolde(): Promise<SoldePlateforme>;
}
