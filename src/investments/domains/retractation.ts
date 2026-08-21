/**
 * Délai de réflexion précontractuel — art. 22 du règlement (UE) 2020/1503.
 *
 * Domaine pur. Trois points de vigilance :
 *
 *  1. Le délai est de quatre jours CALENDAIRES, pas ouvrés.
 *  2. Il ne bénéficie qu'aux investisseurs NON AVERTIS.
 *  3. Pendant le délai, l'investisseur peut révoquer son offre « sans avoir à
 *     se justifier et sans pénalité ». L'engagement n'est donc pas définitif :
 *     les fonds ne doivent pas être mis à disposition du porteur de projet.
 */

export const DELAI_RETRACTATION_JOURS = 4;

/** Échéance du délai de réflexion pour une souscription faite à `souscritLe`. */
export function calculerEcheanceRetractation(souscritLe: Date): Date {
  const echeance = new Date(souscritLe.getTime());
  echeance.setDate(echeance.getDate() + DELAI_RETRACTATION_JOURS);
  return echeance;
}

/** Vrai tant que l'investisseur peut encore se rétracter. */
export function retractationOuverte(
  echeance: Date | null,
  maintenant: Date,
): boolean {
  if (!echeance) return false;
  return maintenant.getTime() <= new Date(echeance).getTime();
}

/** Temps restant, en millisecondes, avant l'expiration du délai. */
export function tempsRestantRetractation(
  echeance: Date | null,
  maintenant: Date,
): number {
  if (!echeance) return 0;
  return Math.max(0, new Date(echeance).getTime() - maintenant.getTime());
}
