/**
 * Répartition d'un montant entre des ayants droit, AU CENTIME EXACT.
 *
 * Le calcul naïf — `round2(total × poids_i / Σ poids)` pour chacun — ne somme
 * pas au total : chaque arrondi perd ou gagne un demi-centime, et l'écart
 * s'accumule. Sur une distribution de loyers entre trois porteurs, 100 € se
 * répartissaient en 33,33 + 33,33 + 33,33 = 99,99 € : un centime restait au
 * projet à chaque période, sans que personne ne l'ait décidé. Dans l'autre
 * sens, le projet paie un centime qu'il n'a pas.
 *
 * MÉTHODE DU PLUS GRAND RESTE — celle des répartitions de sièges :
 *  1. on travaille EN CENTIMES, en nombres entiers, ce qui élimine le flottant ;
 *  2. chacun reçoit la partie entière de sa quote-part ;
 *  3. les centimes restants vont aux plus grandes parties fractionnaires, un
 *     par ayant droit.
 *
 * Propriété garantie : `Σ résultat === total`, exactement, quels que soient
 * les poids. Y compris pour un total NÉGATIF (moins-value), où la même
 * mécanique s'applique sans cas particulier.
 *
 * Déterministe : à parties fractionnaires égales, c'est le rang le plus petit
 * qui l'emporte. Deux exécutions sur les mêmes entrées donnent le même
 * résultat — un calcul de distribution doit être rejouable.
 */
export function repartirAuPlusGrandReste(
  total: number,
  poids: readonly number[],
): number[] {
  if (poids.length === 0) return [];

  const totalCentimes = Math.round(total * 100);
  const sommePoids = poids.reduce((somme, p) => somme + p, 0);

  // Aucun poids : personne n'a de droit, on ne distribue rien plutôt que de
  // diviser par zéro.
  if (sommePoids === 0) return poids.map(() => 0);

  const exacts = poids.map((p) => (totalCentimes * p) / sommePoids);
  const bases = exacts.map((e) => Math.floor(e));
  const attribues = bases.reduce((somme, b) => somme + b, 0);
  let restants = totalCentimes - attribues;

  // Rangs triés par partie fractionnaire décroissante, puis par index croissant.
  const rangs = exacts
    .map((exact, index) => ({ index, fraction: exact - Math.floor(exact) }))
    .sort((a, b) =>
      b.fraction === a.fraction ? a.index - b.index : b.fraction - a.fraction,
    );

  const centimes = [...bases];
  for (const rang of rangs) {
    if (restants <= 0) break;
    centimes[rang.index] += 1;
    restants -= 1;
  }

  return centimes.map((c) => c / 100);
}
