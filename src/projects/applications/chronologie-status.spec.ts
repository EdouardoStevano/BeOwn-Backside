import { computeChronologieStatuts } from './chronologie-status';

const et = (date: string) => ({ etape: `E-${date}`, date, statut: 'pending' as const });

describe('computeChronologieStatuts', () => {
  const today = new Date('2026-07-22T00:00:00Z');
  it('marque done le passé, in_progress la prochaine, pending le futur', () => {
    const out = computeChronologieStatuts(
      [et('2026-01-01'), et('2026-07-01'), et('2026-12-01'), et('2027-01-01')],
      today,
    );
    expect(out.map((e) => e.statut)).toEqual(['done', 'done', 'in_progress', 'pending']);
  });
  it('toutes passées → toutes done', () => {
    const out = computeChronologieStatuts([et('2020-01-01'), et('2021-01-01')], today);
    expect(out.every((e) => e.statut === 'done')).toBe(true);
  });
  it('toutes futures → première in_progress', () => {
    const out = computeChronologieStatuts([et('2030-01-01'), et('2031-01-01')], today);
    expect(out.map((e) => e.statut)).toEqual(['in_progress', 'pending']);
  });
  it('tableau vide → vide (pas de throw)', () => {
    expect(computeChronologieStatuts([], today)).toEqual([]);
  });
});
