import { UniteLouableMapper } from './unite-louable.mapper';
import { UniteLouable } from '../../../domains/unite-louable';

describe('UniteLouableMapper', () => {
  it('roundtrip preserves decimal fields as numbers', () => {
    const d: UniteLouable = Object.assign(new UniteLouable(), {
      id: 'u1',
      projetId: 'p1',
      reference: 'Apt 3B',
      surfaceM2: 65.5,
      loyerMensuelCible: 150_000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const e = UniteLouableMapper.toEntity(d);
    (e as any).surfaceM2 = '65.50';
    (e as any).loyerMensuelCible = '150000.00';
    const back = UniteLouableMapper.toDomain(e);
    expect(back.surfaceM2).toBe(65.5);
    expect(back.loyerMensuelCible).toBe(150_000);
    expect(typeof back.loyerMensuelCible).toBe('number');
  });

  it('handles null surface', () => {
    const d: UniteLouable = Object.assign(new UniteLouable(), {
      id: 'u1',
      projetId: 'p1',
      reference: 'Lot 1',
      surfaceM2: null,
      loyerMensuelCible: 100_000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const back = UniteLouableMapper.toDomain(UniteLouableMapper.toEntity(d));
    expect(back.surfaceM2).toBeNull();
  });
});
