/**
 * Calcul du bonus de parrainage — domaine pur, testable sans base ni réseau.
 *
 * RÈGLE. Chaque bénéficiaire (parrain ET filleul) reçoit `tauxPct` % du
 * montant du premier investissement définitif du filleul, dans la limite d'un
 * plafond ANNUEL par bénéficiaire. Le plafond est une borne anti-abus (chaîne
 * de comptes, gros volumes orchestrés) ET une borne budgétaire : le bonus est
 * un coût marketing de la plateforme, pas un revenu d'investissement.
 *
 * PLAFONNEMENT PARTIEL plutôt que refus : si le bonus théorique dépasse le
 * restant annuel, on crédite le restant (éventuellement 0) au lieu de tout
 * refuser. Refuser en bloc inciterait à fractionner artificiellement les
 * parrainages pour passer sous la barre ; verser le reliquat épuise
 * simplement l'enveloppe.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface BonusParrainageCalcule {
  /** Montant effectivement à créditer (déjà arrondi au centime). */
  montantEur: number;
  /** Vrai si le plafond annuel a réduit le bonus théorique. */
  plafonne: boolean;
}

/**
 * @param montantBaseEur montant de l'investissement déclencheur
 * @param tauxPct taux du bonus en pourcent (ex. 1 → 1 %)
 * @param dejaPercuAnneeEur bonus de parrainage déjà perçus par CE bénéficiaire
 *   sur l'année civile en cours (tous rôles confondus)
 * @param plafondAnnuelEur plafond annuel par bénéficiaire
 *
 * Toute entrée invalide (négative, NaN, non finie) produit un bonus nul :
 * dans un chemin qui crédite de l'argent ex nihilo, l'erreur de configuration
 * doit se solder par « rien versé », jamais par un montant fantaisiste.
 */
export function calculerBonusParrainage(
  montantBaseEur: number,
  tauxPct: number,
  dejaPercuAnneeEur: number,
  plafondAnnuelEur: number,
): BonusParrainageCalcule {
  const entreesValides =
    Number.isFinite(montantBaseEur) &&
    Number.isFinite(tauxPct) &&
    Number.isFinite(dejaPercuAnneeEur) &&
    Number.isFinite(plafondAnnuelEur) &&
    montantBaseEur > 0 &&
    tauxPct > 0 &&
    plafondAnnuelEur > 0;
  if (!entreesValides) {
    return { montantEur: 0, plafonne: false };
  }

  const theorique = round2((montantBaseEur * tauxPct) / 100);
  const restant = Math.max(0, round2(plafondAnnuelEur - Math.max(0, dejaPercuAnneeEur)));
  const montantEur = Math.min(theorique, restant);
  return { montantEur, plafonne: montantEur < theorique };
}
