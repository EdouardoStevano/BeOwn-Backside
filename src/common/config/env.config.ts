/**
 * Lecture typée des réglages numériques d'environnement.
 *
 * Règle unique : une variable ABSENTE vaut son défaut, une variable PRÉSENTE
 * mais invalide fait ÉCHOUER LE DÉMARRAGE. Un réglage qu'on croit appliqué et
 * qui est retombé en silence sur son défaut (limite de débit, taille de pool)
 * est plus dangereux que pas de réglage du tout : il se découvre en
 * production, sous charge.
 */
export function lireEntierPositif(nom: string, defaut: number): number {
  const brut = process.env[nom];
  if (brut === undefined || brut.trim() === '') return defaut;
  const valeur = Number(brut);
  if (!Number.isInteger(valeur) || valeur <= 0) {
    throw new Error(
      `${nom} doit être un entier strictement positif (reçu « ${brut} »).`,
    );
  }
  return valeur;
}
