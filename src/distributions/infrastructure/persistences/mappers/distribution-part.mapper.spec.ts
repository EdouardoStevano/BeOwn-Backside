import { DistributionPartMapper } from './distribution-part.mapper';
import { DistributionPart } from '../../../domains/distribution-part';

describe('DistributionPartMapper', () => {
  const base: DistributionPart = Object.assign(new DistributionPart(), {
    id: 'dp-1',
    periodeDistributionId: 'pd-1',
    investissementId: 'inv-1',
    pourcentageDetention: 0.05,
    montantBrut: 5_000,
    prelevementIR: 640,
    prelevementCSG: 860,
    montantNet: 3_500,
    payeLe: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('converts decimal strings to numbers (roundtrip)', () => {
    const e = DistributionPartMapper.toEntity(base);
    (e as any).pourcentageDetention = '0.05000000';
    (e as any).montantBrut = '5000.00';
    (e as any).prelevementIR = '640.00';
    (e as any).prelevementCSG = '860.00';
    (e as any).montantNet = '3500.00';
    const back = DistributionPartMapper.toDomain(e);
    expect(back.pourcentageDetention).toBe(0.05);
    expect(back.montantBrut).toBe(5_000);
    expect(back.montantNet).toBe(3_500);
  });

  it('preserves payeLe null', () => {
    const e = DistributionPartMapper.toEntity(base);
    const back = DistributionPartMapper.toDomain(e);
    expect(back.payeLe).toBeNull();
  });

  it('preserves payeLe Date when set', () => {
    const paye: DistributionPart = Object.assign(new DistributionPart(), {
      ...base,
      payeLe: new Date('2026-06-10T10:00:00Z'),
    });
    const e = DistributionPartMapper.toEntity(paye);
    const back = DistributionPartMapper.toDomain(e);
    expect(back.payeLe).toEqual(new Date('2026-06-10T10:00:00Z'));
  });
});
