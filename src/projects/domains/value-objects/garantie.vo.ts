/**
 * Sûreté offerte aux investisseurs (hypothèque, caution, fiducie…).
 *
 * Déclarée jusqu'ici dans `project.entity.ts` et importée par le domaine depuis
 * l'infrastructure (§1). Comme {@link PrevisionnelFinancier}, c'est une donnée
 * d'affichage : le `rang` n'ordonne rien côté serveur, aucune règle ne le lit.
 */
export interface Garantie {
  type: string;
  description?: string;
  /** Rang de la sûreté (1 = premier rang). Purement descriptif. */
  rang?: number;
}
