import { formatEur } from './format-eur';

/**
 * Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }) uses a
 * narrow no-break space (U+202F) as the group/currency separator, not a
 * regular space. We normalize all whitespace to a plain space before
 * asserting so the tests stay readable and don't depend on that detail.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/[\s  ]+/g, ' ').trim();
}

describe('formatEur', () => {
  it('formate un montant décimal avec le symbole € et un séparateur de milliers', () => {
    const result = formatEur(1234.5);
    expect(normalizeSpaces(result)).toContain('1 234,50');
    expect(result).toContain('€');
  });

  it('formate zéro', () => {
    const result = formatEur(0);
    expect(normalizeSpaces(result)).toContain('0,00');
    expect(result).toContain('€');
  });

  it('formate un montant négatif', () => {
    const result = formatEur(-500);
    expect(normalizeSpaces(result)).toContain('-500,00');
    expect(result).toContain('€');
  });

  it('arrondit à deux décimales', () => {
    const result = formatEur(99.999);
    expect(normalizeSpaces(result)).toContain('100,00');
    expect(result).toContain('€');
  });
});
