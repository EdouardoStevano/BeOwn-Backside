/**
 * Comment le bénéficiaire effectif détient sa part.
 *
 * Le cahier des charges distingue les deux — *« possédant 25 % et plus des
 * parts de la société de manière **directe ou indirecte** »* — et le modèle ne
 * le faisait pas : un seul pourcentage, sans dire s'il s'agissait de titres
 * détenus en nom propre ou d'une participation à travers une holding.
 *
 * La distinction n'est pas cosmétique, elle change une règle. Les détentions
 * **directes** se partagent le capital : leur somme ne peut pas dépasser 100 %.
 * Les détentions **indirectes** se superposent — une personne qui contrôle une
 * holding détenant 60 % de la société est bénéficiaire à 60 % indirects, part
 * qui recouvre celle de la holding elle-même. Les additionner toutes ferait
 * refuser des registres parfaitement réguliers.
 *
 * Voir `RegistreDesBeneficiaires`, qui n'oppose la limite qu'aux directes.
 */
export enum ModeDeDetention {
  DIRECTE = 'directe',
  INDIRECTE = 'indirecte',
}

/** Libellés rendus au titulaire dans les messages d'erreur. */
export const LIBELLE_MODE_DETENTION: Record<ModeDeDetention, string> = {
  [ModeDeDetention.DIRECTE]: 'directe',
  [ModeDeDetention.INDIRECTE]: 'indirecte',
};
