/**
 * Formatte un montant en euros pour tout texte destiné à un humain
 * (messages d'API, notifications, emails, PDF).
 *
 * Rend par exemple « 1 234,56 € ». Intl fr-FR sépare les milliers par une
 * espace fine insécable (U+202F) que l'encodage WinAnsi des polices standard
 * pdfkit (Helvetica…) ne connaît pas — on la remplace par une espace
 * insécable classique (U+00A0, présente en WinAnsi) pour que le même
 * formatage soit sûr dans les PDF comme dans les notifications/emails.
 */
const EUR_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

export function formatEur(montant: number): string {
  return EUR_FORMATTER.format(montant).replace(/[  ]/g, ' ');
}
