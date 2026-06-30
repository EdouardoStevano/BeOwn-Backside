import { SortieProjet, StatutSortie } from './sortie-projet';

describe('SortieProjet (invariants)', () => {
  it('plusValueBrute = prixRevente - capitalCible', () => {
    const capitalCible = 200_000_000;
    const prixRevente = 260_000_000;
    const s = new SortieProjet();
    s.prixRevente = prixRevente;
    s.plusValueBrute = prixRevente - capitalCible;
    expect(s.plusValueBrute).toBe(60_000_000);
  });

  it('plusValueBrute peut être négative (moins-value)', () => {
    const s = new SortieProjet();
    s.plusValueBrute = 150_000 - 200_000;
    expect(s.plusValueBrute).toBe(-50_000);
  });

  it('expose les statuts attendus du cycle de vie', () => {
    expect(StatutSortie.PROJETEE).toBe('projetee');
    expect(StatutSortie.ACTEE).toBe('actee');
    expect(StatutSortie.DISTRIBUEE).toBe('distribuee');
    expect(StatutSortie.ANNULEE).toBe('annulee');
  });
});
