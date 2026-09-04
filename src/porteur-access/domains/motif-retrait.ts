/**
 * Motifs de RETRAIT de l'accès porteur — LISTE FERMÉE.
 *
 * Même régime que `MotifRefusAccesPorteur`, et pour les mêmes raisons : la
 * clause CGU de retrait exige une mesure MOTIVÉE, NOTIFIÉE et RÉVERSIBLE. Un
 * motif codé satisfait les trois sans jamais faire circuler de texte libre :
 *  - motivé : le code est choisi dans cette liste, pas rédigé au fil de l'eau ;
 *  - notifié : seul le LIBELLÉ associé part dans la notification — donc rien
 *    qu'un instructeur aurait écrit sur la personne ;
 *  - opposable et conservable : le code entre tel quel dans `audit_log`
 *    (cinq ans, hors purge, hors export). Un texte libre y serait une donnée
 *    personnelle bloquée par une durée légale — exactement ce que la
 *    séparation code / complément interne évite ailleurs dans ce module.
 *
 * C'est la raison pour laquelle AUCUN champ de texte libre n'accompagne le
 * retrait : il n'y a pas de second destinataire interne à servir ici (le
 * `motifRefusComplement` d'un refus sert la conversation entre instructeurs
 * sur un dossier qui reste ouvert à réexamen ; un retrait, lui, se relit dans
 * le journal d'audit). Le jour où un besoin réel apparaîtrait, il devrait
 * reprendre le régime de `motifRefusComplement` : jamais notifié, jamais
 * audité en clair, purgé avec le texte libre.
 */
export enum MotifRetraitAccesPorteur {
  /** Manquement aux engagements du porteur (CGU, obligations contractuelles). */
  MANQUEMENT_CONTRACTUEL = 'manquement_contractuel',
  /** Obstacle légal LCB-FT (art. L. 561-* CMF) apparu après l'octroi. */
  OBSTACLE_LEGAL_LCBFT = 'obstacle_legal_lcbft',
  /** Le compte ne remplit plus les critères d'éligibilité de la plateforme. */
  CRITERES_NON_MAINTENUS = 'criteres_non_maintenus',
  /** Retrait demandé par le titulaire lui-même. */
  DEMANDE_DU_TITULAIRE = 'demande_du_titulaire',
  /** Octroi erroné : correction d'une décision rendue par erreur. */
  OCTROI_ERRONE = 'octroi_errone',
}

/**
 * Libellés communiqués au titulaire. Le texte de la notification de retrait ne
 * peut venir que d'ici : aucune concaténation de saisie libre.
 */
export const LIBELLES_MOTIF_RETRAIT: Readonly<
  Record<MotifRetraitAccesPorteur, string>
> = Object.freeze({
  [MotifRetraitAccesPorteur.MANQUEMENT_CONTRACTUEL]:
    'Manquement aux engagements prévus par les conditions générales.',
  [MotifRetraitAccesPorteur.OBSTACLE_LEGAL_LCBFT]:
    'Obstacle légal à la poursuite de la relation.',
  [MotifRetraitAccesPorteur.CRITERES_NON_MAINTENUS]:
    "Critères d'éligibilité de l'espace porteur non maintenus.",
  [MotifRetraitAccesPorteur.DEMANDE_DU_TITULAIRE]:
    'Retrait effectué à votre demande.',
  [MotifRetraitAccesPorteur.OCTROI_ERRONE]:
    "Régularisation d'un accès ouvert par erreur.",
});

export function estMotifRetraitConnu(
  valeur: unknown,
): valeur is MotifRetraitAccesPorteur {
  return Object.values(MotifRetraitAccesPorteur).includes(
    valeur as MotifRetraitAccesPorteur,
  );
}

/** Libellé opposable d'un motif codé de retrait. */
export function libelleMotifRetrait(motif: MotifRetraitAccesPorteur): string {
  return LIBELLES_MOTIF_RETRAIT[motif];
}
