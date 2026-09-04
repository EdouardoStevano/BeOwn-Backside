/**
 * Motifs de refus d'une demande d'accès porteur — LISTE FERMÉE.
 *
 * Exigence de conformité : le motif communiqué au demandeur est un CODE tiré
 * de cette liste, jamais du texte libre. Trois raisons :
 *  - le refus est motivé de façon homogène et opposable, sans rédaction
 *    improvisée qui engagerait la plateforme ;
 *  - le code se conserve cinq ans (traçabilité de l'examen exigé par les CGU)
 *    alors que le texte libre, lui, est purgeable — il n'y a donc jamais de
 *    donnée personnelle en texte libre bloquée par une durée légale ;
 *  - le libellé est traduisible côté front sans relire une base de phrases.
 *
 * Le complément libre EXISTE (`motifRefusComplement`) mais reste INTERNE : il
 * ne sort ni dans la notification, ni dans le message d'erreur. Il sert la
 * conversation entre instructeurs.
 */
export enum MotifRefusAccesPorteur {
  /** Vérification d'identité non aboutie ou expirée. */
  IDENTITE_NON_VERIFIEE = 'identite_non_verifiee',
  /** Dossier incomplet, ou informations fournies inexactes. */
  DOSSIER_INCOMPLET = 'dossier_incomplet',
  /** Projet hors des critères d'éligibilité de la plateforme. */
  HORS_CRITERES = 'hors_criteres',
  /** Obstacle légal LCB-FT (art. L. 561-* CMF). */
  OBSTACLE_LEGAL_LCBFT = 'obstacle_legal_lcbft',
}

/**
 * Libellés communiqués au demandeur. Le texte de la notification sortante ne
 * peut venir que d'ici : aucune concaténation de saisie libre.
 */
export const LIBELLES_MOTIF_REFUS: Readonly<
  Record<MotifRefusAccesPorteur, string>
> = Object.freeze({
  [MotifRefusAccesPorteur.IDENTITE_NON_VERIFIEE]:
    "Vérification d'identité non aboutie ou expirée.",
  [MotifRefusAccesPorteur.DOSSIER_INCOMPLET]:
    'Demande incomplète ou informations inexactes.',
  [MotifRefusAccesPorteur.HORS_CRITERES]:
    "Projet hors des critères d'éligibilité de la plateforme.",
  [MotifRefusAccesPorteur.OBSTACLE_LEGAL_LCBFT]:
    'Obstacle légal à la poursuite de la relation.',
});

/** Longueur maximale du complément interne (jamais communiqué au demandeur). */
export const MOTIF_REFUS_COMPLEMENT_LONGUEUR_MAX = 1000;

export function estMotifRefusConnu(
  valeur: unknown,
): valeur is MotifRefusAccesPorteur {
  return Object.values(MotifRefusAccesPorteur).includes(
    valeur as MotifRefusAccesPorteur,
  );
}

/** Libellé opposable d'un motif codé. */
export function libelleMotifRefus(motif: MotifRefusAccesPorteur): string {
  return LIBELLES_MOTIF_REFUS[motif];
}
