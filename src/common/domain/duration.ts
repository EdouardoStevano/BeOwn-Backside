/**
 * Rend une durée en secondes sous forme lisible (« 30 minutes », « 1 heure »).
 *
 * Sert à composer les emails à partir du TTL réel du token : le message ne peut
 * donc jamais promettre une durée que le token ne tient pas.
 */
export function humanizeDuration(seconds: number): string {
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return hours === 1 ? '1 heure' : `${hours} heures`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  return `${seconds} secondes`;
}
