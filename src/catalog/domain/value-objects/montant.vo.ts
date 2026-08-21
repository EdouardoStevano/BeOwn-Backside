/**
 * Arrondi au centime.
 *
 * `Math.round(n * 100) / 100` était réécrit en `round2` privé dans
 * `DeclareSortieUseCase` et dans `ExecuteSortieUseCase` — deux copies d'une
 * règle qui décide de ce qui est réellement versé sur des wallets. Une seule
 * définition, dans le domaine, pour que les deux ne puissent plus diverger.
 *
 * Une fonction et non une classe `Money` : les montants circulent ici en
 * `number` de bout en bout, jusqu'aux colonnes `decimal(18,2)`. Introduire un
 * Value Object monétaire complet obligerait à convertir aux frontières de
 * quatre autres contextes (Treasury, Subscription, Distributions, Servicing) —
 * c'est un chantier en soi, pas un effet de bord de celui-ci.
 */
export function arrondirAuCentime(montant: number): number {
  return Math.round(montant * 100) / 100;
}
