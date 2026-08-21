/**
 * Bornes du versement instantané (Stripe Instant Payouts, zone euro).
 *
 * Règle de DOMAINE pure : aucune dépendance, testable sans base ni réseau.
 *
 * - Plancher : Stripe accepte à partir de 0,40 €, mais BeOwn impose déjà un
 *   minimum de retrait de 10 € (cf. `CreateRetraitDto`). On reprend ce plancher
 *   pour ne pas exposer deux minima contradictoires à l'investisseur.
 * - Plafond : 9 999 € par versement instantané (limite Stripe zone euro).
 *
 * ⚠ Ces bornes ne s'appliquent QU'AU versement instantané. Le retrait standard
 * conserve son comportement historique (aucun plafond applicatif) : ajouter un
 * plafond global aurait cassé les retraits standards de montant élevé.
 */
export const INSTANT_PAYOUT_MIN_EUR = 10;
export const INSTANT_PAYOUT_MAX_EUR = 9_999;

export const isInstantPayoutAmountAllowed = (amountEur: number): boolean =>
  Number.isFinite(amountEur) &&
  amountEur >= INSTANT_PAYOUT_MIN_EUR &&
  amountEur <= INSTANT_PAYOUT_MAX_EUR;

/** Message utilisateur unique, pour ne pas diverger d'un point d'appel à l'autre. */
export const INSTANT_PAYOUT_RANGE_MESSAGE =
  `Le virement instantané accepte un montant compris entre ${INSTANT_PAYOUT_MIN_EUR} € ` +
  `et ${INSTANT_PAYOUT_MAX_EUR.toLocaleString('fr-FR')} €.`;
