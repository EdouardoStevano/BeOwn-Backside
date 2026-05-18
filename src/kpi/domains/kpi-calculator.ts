import { Cashflow } from './types';

const MS_PER_YEAR = 365.25 * 86_400_000;

/**
 * IRR annualisé sur flux datés (Newton-Raphson).
 * Convention: amount négatif = sortie (investissement), positif = entrée.
 * Returns null if fewer than 2 flows, no sign change, or non-convergent.
 */
export function computeIrr(flows: Cashflow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;

  const t0 = flows[0].date.getTime();
  const yearsFromT0 = (d: Date) => (d.getTime() - t0) / MS_PER_YEAR;

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    let npv = 0;
    let dNpv = 0;
    for (const { date, amount } of flows) {
      const t = yearsFromT0(date);
      const denom = Math.pow(1 + rate, t);
      npv += amount / denom;
      dNpv += (-t * amount) / (denom * (1 + rate));
    }
    if (Math.abs(npv) < 1e-7) return rate;
    if (dNpv === 0) return null;
    const next = rate - npv / dNpv;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next;
  }
  return null;
}
