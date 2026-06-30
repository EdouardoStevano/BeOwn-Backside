import { PeriodeDistributionMapper } from './periode-distribution.mapper';
import { PeriodeDistribution } from '../../../domains/periode-distribution';
import { StatutPeriodeDistribution } from '../../../domains/enums/statut-periode-distribution.enum';

describe('PeriodeDistributionMapper', () => {
  const base: PeriodeDistribution = Object.assign(new PeriodeDistribution(), {
    id: 'pd-1',
    projetId: 'proj-1',
    periode: '2026-05',
    totalLoyers: 500_000,
    totalCharges: 75_000,
    revenuNet: 425_000,
    statut: StatutPeriodeDistribution.CALCULEE,
    calculeeLe: new Date('2026-06-05T09:00:00Z'),
    valideeLe: null,
    distribueeLe: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('roundtrip converts decimal columns to numbers', () => {
    const e = PeriodeDistributionMapper.toEntity(base);
    (e as any).totalLoyers = '500000.00';
    (e as any).totalCharges = '75000.00';
    (e as any).revenuNet = '425000.00';
    const back = PeriodeDistributionMapper.toDomain(e);
    expect(typeof back.totalLoyers).toBe('number');
    expect(back.totalLoyers).toBe(500_000);
    expect(back.revenuNet).toBe(425_000);
  });

  it('preserves nullable timestamps', () => {
    const e = PeriodeDistributionMapper.toEntity(base);
    const back = PeriodeDistributionMapper.toDomain(e);
    expect(back.valideeLe).toBeNull();
    expect(back.distribueeLe).toBeNull();
  });

  it('preserves status enum', () => {
    const e = PeriodeDistributionMapper.toEntity(base);
    const back = PeriodeDistributionMapper.toDomain(e);
    expect(back.statut).toBe(StatutPeriodeDistribution.CALCULEE);
  });
});
