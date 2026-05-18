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
