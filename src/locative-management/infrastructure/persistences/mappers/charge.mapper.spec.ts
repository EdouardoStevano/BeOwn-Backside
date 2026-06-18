import { ChargeMapper } from './charge.mapper';
import { Charge } from '../../../domains/charge';
import { StatutDeclaration } from '../../../domains/enums/statut-declaration.enum';
import { TypeCharge } from '../../../domains/enums/type-charge.enum';

describe('ChargeMapper', () => {
  it('roundtrip preserves justificatifs array and montant as number', () => {
    const d: Charge = Object.assign(new Charge(), {
      id: 'c1',
      projetId: 'p1',
      type: TypeCharge.MAINTENANCE,
      description: 'Réparation chaudière',
      montant: 35_000,
      periode: '2026-05',
      dateOperation: new Date('2026-05-15'),
      justificatifs: ['https://x/facture.pdf', 'https://x/devis.pdf'],
      statut: StatutDeclaration.DECLARE,
      declareParUserId: 7,
      valideParUserId: null,
      valideLe: null,
      motifRejet: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const e = ChargeMapper.toEntity(d);
    (e as any).montant = '35000.00';
    const back = ChargeMapper.toDomain(e);
    expect(back.montant).toBe(35_000);
    expect(typeof back.montant).toBe('number');
    expect(back.justificatifs).toEqual([
      'https://x/facture.pdf',
      'https://x/devis.pdf',
    ]);
    expect(back.type).toBe(TypeCharge.MAINTENANCE);
    expect(back.statut).toBe(StatutDeclaration.DECLARE);
  });

  it('defaults justificatifs to empty array if undefined', () => {
    const d: Charge = Object.assign(new Charge(), {
      id: 'c1',
      projetId: 'p1',
      type: TypeCharge.ASSURANCE,
      description: 'Prime annuelle',
      montant: 50_000,
      periode: '2026-05',
      dateOperation: new Date(),
      justificatifs: [],
      statut: StatutDeclaration.DECLARE,
      declareParUserId: 7,
      valideParUserId: null,
      valideLe: null,
      motifRejet: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const e = ChargeMapper.toEntity(d);
    (e as any).justificatifs = undefined;
    const back = ChargeMapper.toDomain(e);
    expect(back.justificatifs).toEqual([]);
  });
});
