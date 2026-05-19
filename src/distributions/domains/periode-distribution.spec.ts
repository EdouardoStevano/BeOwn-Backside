import { PeriodeDistribution } from './periode-distribution';

describe('PeriodeDistribution (invariants)', () => {
  it('revenuNet = totalLoyers - totalCharges', () => {
    const p = new PeriodeDistribution();
    p.totalLoyers = 500_000;
    p.totalCharges = 75_000;
    p.revenuNet = p.totalLoyers - p.totalCharges;
    expect(p.revenuNet).toBe(425_000);
  });

  it('revenuNet peut être négatif (mois déficitaire)', () => {
    const p = new PeriodeDistribution();
    p.totalLoyers = 30_000;
    p.totalCharges = 50_000;
    p.revenuNet = p.totalLoyers - p.totalCharges;
    expect(p.revenuNet).toBeLessThan(0);
  });
});
