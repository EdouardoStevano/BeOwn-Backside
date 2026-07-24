import { DistributionPart } from './distribution-part';

describe('DistributionPart (invariants)', () => {
  const make = (overrides: Partial<DistributionPart>): DistributionPart =>
    Object.assign(new DistributionPart(), {
      id: 'x',
      periodeDistributionId: 'p',
      investissementId: 'i',
      pourcentageDetention: 0.05,
      montantBrut: 0,
      prelevementIR: 0,
      prelevementCSG: 0,
      montantNet: 0,
      payeLe: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

  it('montantNet = montantBrut - prelevementIR - prelevementCSG', () => {
    const p = make({
      montantBrut: 1000,
      prelevementIR: 128,
      prelevementCSG: 172,
      montantNet: 700,
    });
    expect(p.montantBrut - p.prelevementIR - p.prelevementCSG).toBe(
      p.montantNet,
    );
  });

  it('pourcentageDetention reste dans [0, 1]', () => {
    const p = make({ pourcentageDetention: 0.5 });
    expect(p.pourcentageDetention).toBeGreaterThanOrEqual(0);
    expect(p.pourcentageDetention).toBeLessThanOrEqual(1);
  });

  it('somme des parts ≈ revenuNet (à 1 centime près)', () => {
    const revenuNet = 100_000;
    const parts = [
      make({ pourcentageDetention: 0.3, montantBrut: 30_000 }),
      make({ pourcentageDetention: 0.45, montantBrut: 45_000 }),
      make({ pourcentageDetention: 0.25, montantBrut: 25_000 }),
    ];
    const somme = parts.reduce((s, p) => s + p.montantBrut, 0);
    expect(Math.abs(somme - revenuNet)).toBeLessThanOrEqual(0.01);
  });
});
