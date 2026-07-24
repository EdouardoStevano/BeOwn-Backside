import { DocumentFiscalMapper } from './document-fiscal.mapper';
import { DocumentFiscal } from '../../../domains/document-fiscal';

describe('DocumentFiscalMapper', () => {
  const base: DocumentFiscal = Object.assign(new DocumentFiscal(), {
    id: 'df-1',
    userId: 42,
    annee: 2026,
    montantBrut: 100_000,
    montantIR: 12_800,
    montantCSG: 17_200,
    montantNet: 70_000,
    pdfUrl: 'https://x/ifu-2026.pdf',
    genereeLe: new Date('2027-01-15T09:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('roundtrip converts all decimal columns to numbers', () => {
    const e = DocumentFiscalMapper.toEntity(base);
    (e as any).montantBrut = '100000.00';
    (e as any).montantIR = '12800.00';
    (e as any).montantCSG = '17200.00';
    (e as any).montantNet = '70000.00';
    const back = DocumentFiscalMapper.toDomain(e);
    expect(back.montantBrut).toBe(100_000);
    expect(back.montantIR).toBe(12_800);
    expect(back.montantCSG).toBe(17_200);
    expect(back.montantNet).toBe(70_000);
    expect(typeof back.montantBrut).toBe('number');
  });

  it('handles unrendered document (pdfUrl null, genereeLe null)', () => {
    const pending: DocumentFiscal = Object.assign(new DocumentFiscal(), {
      ...base,
      pdfUrl: null,
      genereeLe: null,
    });
    const e = DocumentFiscalMapper.toEntity(pending);
    const back = DocumentFiscalMapper.toDomain(e);
    expect(back.pdfUrl).toBeNull();
    expect(back.genereeLe).toBeNull();
  });

  it('respects IR 12.8% + CSG 17.2% = 30% fiscalité totale', () => {
    expect(base.montantIR).toBeCloseTo(base.montantBrut * 0.128, 2);
    expect(base.montantCSG).toBeCloseTo(base.montantBrut * 0.172, 2);
    expect(base.montantIR + base.montantCSG).toBeCloseTo(
      base.montantBrut * 0.3,
      2,
    );
  });
});
