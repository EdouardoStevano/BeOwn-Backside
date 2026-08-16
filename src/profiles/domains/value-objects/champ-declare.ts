/**
 * Applique une règle à un champ **seulement s'il a été déclaré**.
 *
 * Le formulaire de complétion est progressif et partiel : `undefined` y
 * signifie « ne pas toucher », là où `null` signifie « effacer ». La distinction
 * doit être faite champ par champ, et la refaire à la main quinze fois donnait
 * quinze occasions d'écrire `if (x)` au lieu de `if (x !== undefined)` — auquel
 * cas effacer un champ devient impossible, puisque `null` est falsy.
 *
 * @param saisie ce qu'a envoyé l'appelant, `undefined` s'il n'en a rien dit.
 * @param eprouver la règle du Value Object correspondant.
 * @param actuelle la valeur en place, conservée en l'absence de déclaration.
 */
export function siDeclare<TSaisie, TValide>(
  saisie: TSaisie | undefined,
  eprouver: (saisie: TSaisie) => TValide,
  actuelle: TValide,
): TValide {
  return saisie === undefined ? actuelle : eprouver(saisie);
}
