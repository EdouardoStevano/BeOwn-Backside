import { BailMapper } from './bail.mapper';
import { Bail } from '../../../domains/bail';
import { StatutBail } from '../../../domains/enums/statut-bail.enum';

describe('BailMapper', () => {
  it('roundtrip preserves date, statut and loyer as number', () => {
    const d: Bail = Object.assign(new Bail(), {
      id: 'b1',
      uniteLouableId: 'u1',
      locataireId: 'l1',
      loyerMensuel: 150_000,
      dateDebut: new Date('2026-01-01'),
      dateFin: new Date('2027-12-31'),
      statut: StatutBail.ACTIF,
      contratPdfUrl: 'https://x/contrat.pdf',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const e = BailMapper.toEntity(d);
    (e as any).loyerMensuel = '150000.00';
    const back = BailMapper.toDomain(e);
    expect(back.loyerMensuel).toBe(150_000);
    expect(typeof back.loyerMensuel).toBe('number');
    expect(back.statut).toBe(StatutBail.ACTIF);
    expect(back.contratPdfUrl).toBe('https://x/contrat.pdf');
    expect(back.dateDebut).toEqual(new Date('2026-01-01'));
  });

  it('handles null dateFin and null contratPdfUrl', () => {
    const d: Bail = Object.assign(new Bail(), {
      id: 'b1',
      uniteLouableId: 'u1',
      locataireId: 'l1',
      loyerMensuel: 100_000,
      dateDebut: new Date('2026-01-01'),
      dateFin: null,
      statut: StatutBail.ACTIF,
      contratPdfUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const back = BailMapper.toDomain(BailMapper.toEntity(d));
    expect(back.dateFin).toBeNull();
    expect(back.contratPdfUrl).toBeNull();
  });
});
