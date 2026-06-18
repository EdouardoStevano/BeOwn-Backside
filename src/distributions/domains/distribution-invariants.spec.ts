import { PeriodeDistribution } from './periode-distribution';
import { DistributionPart } from './distribution-part';
import { StatutPeriodeDistribution } from './enums/statut-periode-distribution.enum';

/**
 * Tests d'invariants croisés entre PeriodeDistribution et DistributionPart.
 * Vérifient les contraintes métier fondamentales du moteur de distribution
 * variable equity-locatif (Phase 3 consommera ces invariants).
 */
describe('Invariants cross-entité distributions', () => {
  const makePeriode = (revenuNet: number): PeriodeDistribution => {
    const p = new PeriodeDistribution();
    p.id = 'pd-1';
    p.projetId = 'proj-1';
    p.periode = '2026-05';
    p.totalLoyers = revenuNet + 50_000;
    p.totalCharges = 50_000;
    p.revenuNet = revenuNet;
    p.statut = StatutPeriodeDistribution.CALCULEE;
    p.calculeeLe = new Date();
    p.valideeLe = null;
    p.distribueeLe = null;
    p.createdAt = new Date();
    p.updatedAt = new Date();
    return p;
  };

  let partCounter = 0;
  const makePart = (pct: number, revenuNet: number): DistributionPart => {
    const part = new DistributionPart();
    part.id = `part-${++partCounter}`;
    part.periodeDistributionId = 'pd-1';
    part.investissementId = `inv-${partCounter}`;
    part.pourcentageDetention = pct;
    part.montantBrut = Math.round(revenuNet * pct * 100) / 100;
    part.prelevementIR = Math.round(part.montantBrut * 0.128 * 100) / 100;
    part.prelevementCSG = Math.round(part.montantBrut * 0.172 * 100) / 100;
    part.montantNet =
      Math.round(
        (part.montantBrut - part.prelevementIR - part.prelevementCSG) * 100,
      ) / 100;
    part.payeLe = null;
    part.createdAt = new Date();
    part.updatedAt = new Date();
    return part;
  };

  it('somme des montantBrut ≈ revenuNet (à 1 centime près) pour 100 investisseurs uniformes', () => {
    const revenuNet = 1_000_000;
    const parts = Array.from({ length: 100 }, () => makePart(0.01, revenuNet));
    const somme = parts.reduce((s, p) => s + p.montantBrut, 0);
    expect(Math.abs(somme - revenuNet)).toBeLessThanOrEqual(1.0); // 100 parts × 0.01 cents
  });

  it('somme parts < revenuNet si pourcentages cumulés < 100 %', () => {
    const periode = makePeriode(100_000);
    const parts = [
      makePart(0.3, periode.revenuNet),
      makePart(0.2, periode.revenuNet),
    ]; // 50 % seulement
    const somme = parts.reduce((s, p) => s + p.montantBrut, 0);
    expect(somme).toBeLessThan(periode.revenuNet);
    expect(somme).toBeCloseTo(50_000, 2);
  });

  it('montantNet = montantBrut − IR − CSG pour chaque part', () => {
    const part = makePart(0.05, 100_000);
    expect(
      part.montantBrut - part.prelevementIR - part.prelevementCSG,
    ).toBeCloseTo(part.montantNet, 2);
  });

  it('fiscalité totale = 30 % du brut (IR 12.8 % + CSG 17.2 %)', () => {
    const part = makePart(0.05, 100_000);
    const fiscaliteTotale = part.prelevementIR + part.prelevementCSG;
    expect(fiscaliteTotale).toBeCloseTo(part.montantBrut * 0.3, 2);
  });

  it('revenuNet négatif (mois déficitaire) propage des parts négatives', () => {
    const periode = makePeriode(-20_000); // 30k loyers - 50k charges
    const part = makePart(0.05, periode.revenuNet);
    expect(part.montantBrut).toBeLessThan(0);
    // Note : à raffiner en Phase 3 — décision métier sur déficit (report ?
    // distribution suspendue ?). Pour l'instant invariant mathématique vérifié.
  });
});
