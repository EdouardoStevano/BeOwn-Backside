/**
 * Le vocabulaire de l'échéancier (§4) — il vivait dans
 * `subscription/domain/enums/investment-status.enum.ts`, aux côtés du cycle de
 * vie de l'investissement, alors qu'aucune des deux notions ne se déduit de
 * l'autre : un investissement `CONFIRME` porte des échéances `A_VENIR`, `PAYE`
 * et `RETARD_LEGER` en même temps.
 */

/**
 * **Statut d'une échéance.** Les trois paliers de retard sont ceux de
 * RG-ECH-11 : un impayé ne devient pas un défaut le lendemain, il se qualifie
 * par le temps écoulé depuis la date prévue.
 */
export enum EcheanceStatus {
  A_VENIR = 'a_venir',
  EN_ATTENTE_PAIEMENT = 'en_attente_paiement',
  PAYE = 'paye',
  /** Hérité — `RETARD_LEGER` lui succède ; conservé le temps de la migration. */
  RETARD = 'retard',
  /** J+1 à J+30. */
  RETARD_LEGER = 'retard_leger',
  /** J+31 à J+90. */
  RETARD_SIGNIFICATIF = 'retard_significatif',
  /** Au-delà de J+90. */
  DEFAUT = 'defaut',
  /** Décision d'administration : la créance ne sera pas recouvrée. */
  PERTE_DEFINITIVE = 'perte_definitive',
  IMPAYE = 'impaye',
  ANNULE = 'annule',
}

/**
 * **Mode de remboursement** (RG-ECH-02) — la façon dont capital et intérêts se
 * ventilent sur l'échéancier. Chaque mode a sa stratégie de calcul (§38.1).
 *
 * Le mode est *choisi* par `subscription` à la souscription et *appliqué* ici :
 * c'est le seul terme de ce contexte que l'amont a besoin de nommer, et donc le
 * contrat par lequel une souscription dit quel échéancier elle attend.
 */
export enum RemboursementMode {
  IN_FINE = 'in_fine',
  AMORTISSABLE_CONSTANT = 'amortissable_constant',
  BULLET_INTERETS_TRIMESTRIELS = 'bullet_interets_trimestriels',
}
