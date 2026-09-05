/**
 * Devise de base de TOUS les taux servis par la plateforme.
 *
 * L'euro est l'unité de compte du grand livre : les taux ne servent qu'à
 * AFFICHER un montant dans une autre devise, jamais à en calculer un.
 */
export const DEVISE_DE_BASE = 'EUR';

/**
 * Contrat servi par `GET /public/exchange-rates` — figé par le consommateur
 * (`exchangeRates.datasource.ts` du Frontside).
 *
 * `fetchedAt` n'est pas décoratif : les taux peuvent être servis depuis un
 * cache, voire depuis une lecture antérieure si le fournisseur est en panne.
 * L'horodatage dit de QUAND date la donnée, ce qui permet à l'appelant de
 * décider s'il l'affiche encore.
 */
export interface TauxDeChange {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
}

/**
 * Ne retient d'une réponse de fournisseur que des taux EXPLOITABLES : des
 * codes de devise plausibles associés à des nombres finis et strictement
 * positifs.
 *
 * Fonction pure, dans le domaine, et non dans l'adapter : c'est une règle sur
 * ce qu'est un taux acceptable, pas sur la façon de parler à un fournisseur.
 * Un `0`, un `NaN` ou une chaîne qui traverserait la frontière produirait des
 * montants convertis faux — pire qu'un affichage indisponible.
 */
export const normaliserTaux = (
  brut: Record<string, unknown> | null | undefined,
): Record<string, number> => {
  const taux: Record<string, number> = {};
  if (!brut || typeof brut !== 'object') return taux;

  for (const [code, valeur] of Object.entries(brut)) {
    if (!/^[A-Z]{3}$/.test(code)) continue;
    const nombre = Number(valeur);
    if (Number.isFinite(nombre) && nombre > 0) taux[code] = nombre;
  }
  return taux;
};
