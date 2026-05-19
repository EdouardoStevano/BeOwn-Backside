import { SortieProjetMapper } from './sortie-projet.mapper';
import { SortieProjet, StatutSortie } from '../../../domains/sortie-projet';

describe('SortieProjetMapper', () => {
  const base: SortieProjet = Object.assign(new SortieProjet(), {
    id: 'sp-1',
    projetId: 'proj-1',
    prixRevente: 260_000_000,
    dateRevente: new Date('2031-05-15'),
    plusValueBrute: 60_000_000,
    statut: StatutSortie.ACTEE,
    acteVentePdfUrl: 'https://x/acte.pdf',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('roundtrip converts decimal columns to numbers', () => {
    const e = SortieProjetMapper.toEntity(base);
    (e as any).prixRevente = '260000000.00';
    (e as any).plusValueBrute = '60000000.00';
    const back = SortieProjetMapper.toDomain(e);
    expect(back.prixRevente).toBe(260_000_000);
    expect(back.plusValueBrute).toBe(60_000_000);
    expect(typeof back.prixRevente).toBe('number');
  });

  it('preserves statut and acteVentePdfUrl', () => {
    const e = SortieProjetMapper.toEntity(base);
    const back = SortieProjetMapper.toDomain(e);
    expect(back.statut).toBe(StatutSortie.ACTEE);
    expect(back.acteVentePdfUrl).toBe('https://x/acte.pdf');
  });

  it('handles null acteVentePdfUrl', () => {
    const projetee: SortieProjet = Object.assign(new SortieProjet(), {
      ...base,
      statut: StatutSortie.PROJETEE,
      acteVentePdfUrl: null,
    });
    const e = SortieProjetMapper.toEntity(projetee);
    const back = SortieProjetMapper.toDomain(e);
    expect(back.acteVentePdfUrl).toBeNull();
    expect(back.statut).toBe(StatutSortie.PROJETEE);
  });
});
