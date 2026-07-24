import {
  Cashflow,
  ComputedEcheance,
  EcheanceComputedStatus,
  NetCalculationInput,
  NetCalculationOutput,
} from './types';

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

/**
 * Weighted Average Life: Σ(years × capitalRepaid) / Σ(capitalRepaid).
 * Returns null if total capital ≤ 0. Past-dated échéances contribute 0.
 */
export function computeWal(
  echeancesFutures: Array<{ datePrevue: Date; montantCapital: number }>,
  referenceDate: Date = new Date(),
): number | null {
  const totalCapital = echeancesFutures.reduce((s, e) => s + e.montantCapital, 0);
  if (totalCapital <= 0) return null;

  const weighted = echeancesFutures.reduce((s, e) => {
    const years = (e.datePrevue.getTime() - referenceDate.getTime()) / MS_PER_YEAR;
    return s + Math.max(0, years) * e.montantCapital;
  }, 0);

  return weighted / totalCapital;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeNetInterests(input: NetCalculationInput): NetCalculationOutput {
  const { interetsBruts, regime, tauxBaremeMarginal } = input;
  const csg = round2(interetsBruts * 0.172);

  if (regime === 'DISPENSE') {
    return { net: round2(interetsBruts - csg), prelevementIR: 0, prelevementCSG: csg };
  }
  if (regime === 'BAREME') {
    if (tauxBaremeMarginal === undefined) {
      throw new Error('tauxBaremeMarginal required for BAREME');
    }
    const ir = round2(interetsBruts * tauxBaremeMarginal);
    return { net: round2(interetsBruts - ir - csg), prelevementIR: ir, prelevementCSG: csg };
  }
  // PFU 30% default
  const ir = round2(interetsBruts * 0.128);
  return { net: round2(interetsBruts - ir - csg), prelevementIR: ir, prelevementCSG: csg };
}

const MS_PER_DAY = 86_400_000;

export function deriveEcheanceStatus(
  echeance: { datePrevue: Date; payeLe: Date | null; statut: string },
  now: Date = new Date(),
): EcheanceComputedStatus {
  if (echeance.statut === 'perte_definitive') return 'perte_definitive';
  if (echeance.payeLe) return 'payee';
  const joursRetard = Math.floor((now.getTime() - echeance.datePrevue.getTime()) / MS_PER_DAY);
  if (joursRetard <= 0) return 'a_venir';
  if (joursRetard <= 30) return 'retard_leger';
  if (joursRetard <= 90) return 'retard_significatif';
  return 'defaut';
}

export function aggregateExposureBy<T, K extends string>(
  items: T[],
  keyFn: (item: T) => K,
  amountFn: (item: T) => number,
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const item of items) {
    const k = keyFn(item);
    out[k] = (out[k] ?? 0) + amountFn(item);
  }
  return out;
}

export function tauxDefaut(echeances: ComputedEcheance[]): {
  tauxRetard: number;
  tauxDefaut: number;
  tauxPerteDefinitive: number;
} {
  // Encours = capital non encore remboursé (exclut "payee" et "perte_definitive")
  const encoursStatuts: ComputedEcheance['statut'][] = [
    'a_venir',
    'retard_leger',
    'retard_significatif',
    'defaut',
  ];
  const encoursTotal = echeances
    .filter((e) => encoursStatuts.includes(e.statut))
    .reduce((s, e) => s + e.montantCapital, 0);

  const capitalRetard = echeances
    .filter((e) => e.statut === 'retard_leger' || e.statut === 'retard_significatif')
    .reduce((s, e) => s + e.montantCapital, 0);
  const capitalDefaut = echeances
    .filter((e) => e.statut === 'defaut')
    .reduce((s, e) => s + e.montantCapital, 0);

  const capitalPreteTotal = echeances
    .filter((e) => e.statut !== 'payee')
    .reduce((s, e) => s + e.montantCapital, 0);
  const capitalPerte = echeances
    .filter((e) => e.statut === 'perte_definitive')
    .reduce((s, e) => s + e.montantCapital, 0);

  return {
    tauxRetard: encoursTotal > 0 ? (capitalRetard / encoursTotal) * 100 : 0,
    tauxDefaut: encoursTotal > 0 ? (capitalDefaut / encoursTotal) * 100 : 0,
    tauxPerteDefinitive: capitalPreteTotal > 0 ? (capitalPerte / capitalPreteTotal) * 100 : 0,
  };
}
