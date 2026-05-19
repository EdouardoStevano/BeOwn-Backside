import { LoyerEncaisseMapper } from './loyer-encaisse.mapper';
import { LoyerEncaisse } from '../../../domains/loyer-encaisse';
import { StatutDeclaration } from '../../../domains/enums/statut-declaration.enum';

describe('LoyerEncaisseMapper', () => {
  it('roundtrip preserves preuves array and montant as number', () => {
    const d: LoyerEncaisse = Object.assign(new LoyerEncaisse(), {
      id: 'l1',
      bailId: 'b1',
      periode: '2026-05',
      montant: 150_000,
      dateEncaissement: new Date('2026-05-03'),
      preuves: ['https://x/rb1.pdf', 'https://x/q1.pdf'],
      statut: StatutDeclaration.DECLARE,
      declareParUserId: 7,
      valideParUserId: null,
      valideLe: null,
      motifRejet: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const e = LoyerEncaisseMapper.toEntity(d);
    (e as any).montant = '150000.00';
    const back = LoyerEncaisseMapper.toDomain(e);
    expect(back.montant).toBe(150_000);
    expect(back.preuves).toEqual(['https://x/rb1.pdf', 'https://x/q1.pdf']);
    expect(back.statut).toBe(StatutDeclaration.DECLARE);
  });

  it('defaults preuves to empty array if undefined', () => {
    const d: LoyerEncaisse = Object.assign(new LoyerEncaisse(), {
      id: 'l1',
      bailId: 'b1',
      periode: '2026-05',
      montant: 100_000,
      dateEncaissement: new Date(),
      preuves: [],
      statut: StatutDeclaration.DECLARE,
      declareParUserId: 7,
      valideParUserId: null,
      valideLe: null,
      motifRejet: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const e = LoyerEncaisseMapper.toEntity(d);
    (e as any).preuves = undefined;
    const back = LoyerEncaisseMapper.toDomain(e);
    expect(back.preuves).toEqual([]);
  });
});
