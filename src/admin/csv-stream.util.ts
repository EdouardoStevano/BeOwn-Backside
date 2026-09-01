/**
 * Primitives CSV des exports back-office.
 *
 * RFC 4180, séparateur virgule, fin de ligne CRLF : c'est le dialecte que les
 * tableurs ouvrent sans assistant d'import. Le BOM UTF-8 est indispensable —
 * sans lui, Excel sous Windows lit le fichier en ANSI et les accents des noms
 * propres sont détruits (précisément les données que le back-office exporte).
 * Écrit en séquence d'échappement : un BOM littéral dans les sources est
 * invisible et finit supprimé par un formateur ou un copier-coller.
 */

export const BOM_UTF8 = '\ufeff';

/**
 * Échappe UNE valeur de cellule : guillemets doublés, encadrement dès que la
 * valeur contient un séparateur, un guillemet ou un saut de ligne. Une valeur
 * absente devient une cellule vide — jamais la chaîne « null ».
 */
export function csvEscape(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  const texte = valeur instanceof Date ? valeur.toISOString() : String(valeur);
  if (/[",\r\n]/.test(texte)) {
    return `"${texte.replace(/"/g, '""')}"`;
  }
  return texte;
}

/** Une ligne CSV complète, terminée par CRLF. */
export function ligneCsv(valeurs: readonly unknown[]): string {
  return valeurs.map(csvEscape).join(',') + '\r\n';
}
