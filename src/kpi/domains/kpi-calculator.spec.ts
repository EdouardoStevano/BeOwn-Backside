import { computeIrr } from './kpi-calculator';

describe('computeIrr', () => {
  it('returns 10% for 1000€ invested, 1100€ received one year later', () => {
    const flows = [
      { date: new Date('2025-01-01'), amount: -1000 },
      { date: new Date('2026-01-01'), amount: 1100 },
    ];
    const irr = computeIrr(flows);
    expect(irr).not.toBeNull();
    expect(irr!).toBeCloseTo(0.10, 3);
  });

  it('returns null when fewer than 2 flows', () => {
    expect(computeIrr([])).toBeNull();
    expect(computeIrr([{ date: new Date(), amount: -100 }])).toBeNull();
  });

  it('returns approximately the nominal rate for monthly amortization over 2 years', () => {
    // 1000€ invested, 24 monthly payments of ~46€ (= principal + interest at ~10% annual nominal)
    // We use a simple linear amortization for the test fixture
    const flows = [{ date: new Date('2025-01-01'), amount: -1000 }];
    const monthly = 46.14; // approx payment that yields ~10% IRR on 24 months
    for (let m = 1; m <= 24; m++) {
      const d = new Date('2025-01-01');
      d.setMonth(d.getMonth() + m);
      flows.push({ date: d, amount: monthly });
    }
    const irr = computeIrr(flows);
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(0.08);
    expect(irr!).toBeLessThan(0.12);
  });

  it('returns null when all flows have the same sign (no convergence possible)', () => {
    const flows = [
      { date: new Date('2025-01-01'), amount: 100 },
      { date: new Date('2026-01-01'), amount: 100 },
    ];
    expect(computeIrr(flows)).toBeNull();
  });
});

import { computeWal } from './kpi-calculator';

describe('computeWal', () => {
  const ref = new Date('2025-01-01');

  it('returns null when no future capital to repay', () => {
    expect(computeWal([], ref)).toBeNull();
    expect(computeWal([{ datePrevue: new Date('2026-01-01'), montantCapital: 0 }], ref)).toBeNull();
  });

  it('returns 2 years for a single in-fine repayment at 24 months', () => {
    const wal = computeWal(
      [{ datePrevue: new Date('2027-01-01'), montantCapital: 1000 }],
      ref,
    );
    expect(wal).toBeCloseTo(2.0, 2);
  });

  it('returns ~1 year for linear monthly amortization over 24 months', () => {
    const futures = [];
    for (let m = 1; m <= 24; m++) {
      const d = new Date('2025-01-01');
      d.setMonth(d.getMonth() + m);
      futures.push({ datePrevue: d, montantCapital: 1000 / 24 });
    }
    const wal = computeWal(futures, ref);
    expect(wal).not.toBeNull();
    // mean position of 24 equal monthly payments ≈ 12.5 months = 1.04 years
    expect(wal!).toBeGreaterThan(1.0);
    expect(wal!).toBeLessThan(1.1);
  });

  it('clamps past-dated échéances to 0 contribution', () => {
    const wal = computeWal(
      [
        { datePrevue: new Date('2024-01-01'), montantCapital: 500 },
        { datePrevue: new Date('2026-01-01'), montantCapital: 500 },
      ],
      ref,
    );
    expect(wal).not.toBeNull();
    // half (past) contributes 0, half contributes 1 year × 500 / 1000 = 0.5 year
    expect(wal!).toBeCloseTo(0.5, 2);
  });
});

import { computeNetInterests } from './kpi-calculator';

describe('computeNetInterests', () => {
  it('PFU 30%: 100€ brut → 70€ net (12.80 IR + 17.20 CSG)', () => {
    const r = computeNetInterests({ interetsBruts: 100, regime: 'PFU' });
    expect(r.prelevementIR).toBeCloseTo(12.8, 2);
    expect(r.prelevementCSG).toBeCloseTo(17.2, 2);
    expect(r.net).toBeCloseTo(70.0, 2);
  });

  it('BAREME TMI 30%: 100€ brut → 52.80€ net (30 IR + 17.20 CSG)', () => {
    const r = computeNetInterests({
      interetsBruts: 100,
      regime: 'BAREME',
      tauxBaremeMarginal: 0.30,
    });
    expect(r.prelevementIR).toBeCloseTo(30.0, 2);
    expect(r.prelevementCSG).toBeCloseTo(17.2, 2);
    expect(r.net).toBeCloseTo(52.8, 2);
  });

  it('DISPENSE: 100€ brut → 82.80€ net (0 IR + 17.20 CSG)', () => {
    const r = computeNetInterests({ interetsBruts: 100, regime: 'DISPENSE' });
    expect(r.prelevementIR).toBe(0);
    expect(r.prelevementCSG).toBeCloseTo(17.2, 2);
    expect(r.net).toBeCloseTo(82.8, 2);
  });

  it('throws if BAREME without tauxBaremeMarginal', () => {
    expect(() =>
      computeNetInterests({ interetsBruts: 100, regime: 'BAREME' }),
    ).toThrow('tauxBaremeMarginal required for BAREME');
  });

  it('rounds to 2 decimals (no floating point weirdness)', () => {
    const r = computeNetInterests({ interetsBruts: 33.33, regime: 'PFU' });
    expect(Number.isFinite(r.net)).toBe(true);
    expect(r.net.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});

import { deriveEcheanceStatus } from './kpi-calculator';

describe('deriveEcheanceStatus', () => {
  const now = new Date('2025-06-01T12:00:00Z');

  const make = (datePrevue: string, payeLe: string | null = null, statut = 'a_venir') => ({
    datePrevue: new Date(datePrevue),
    payeLe: payeLe ? new Date(payeLe) : null,
    statut,
  });

  it('returns "payee" when payeLe is set', () => {
    expect(deriveEcheanceStatus(make('2025-05-15', '2025-05-16'), now)).toBe('payee');
  });

  it('returns "perte_definitive" if marked manually', () => {
    expect(
      deriveEcheanceStatus(make('2025-01-01', null, 'perte_definitive'), now),
    ).toBe('perte_definitive');
  });

  it('returns "a_venir" when datePrevue is today or future', () => {
    expect(deriveEcheanceStatus(make('2025-06-01'), now)).toBe('a_venir');
    expect(deriveEcheanceStatus(make('2025-07-01'), now)).toBe('a_venir');
  });

  it('returns "retard_leger" at J+1 to J+30', () => {
    expect(deriveEcheanceStatus(make('2025-05-31'), now)).toBe('retard_leger');
    expect(deriveEcheanceStatus(make('2025-05-02'), now)).toBe('retard_leger');
  });

  it('returns "retard_significatif" at J+31 to J+90', () => {
    expect(deriveEcheanceStatus(make('2025-05-01'), now)).toBe('retard_significatif'); // 31 jours
    expect(deriveEcheanceStatus(make('2025-03-03'), now)).toBe('retard_significatif'); // 90 jours
  });

  it('returns "defaut" beyond J+90', () => {
    expect(deriveEcheanceStatus(make('2025-03-02'), now)).toBe('defaut'); // 91 jours
    expect(deriveEcheanceStatus(make('2024-01-01'), now)).toBe('defaut');
  });
});
