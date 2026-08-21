/**
 * Niveau de risque de l'investisseur, au sens du suivi relationnel : à quelle
 * fréquence la relation doit être reprise pour vérifier que les produits
 * souscrits lui conviennent toujours.
 *
 * Ces trois valeurs circulaient en chaînes nues — `'vulnerable'` comparé
 * littéralement dans `RiskScoringService`, écrit tel quel dans une colonne
 * `varchar`, et documenté par un commentaire à côté d'elle. Une faute de frappe
 * ne cassait rien à la compilation, seulement le calendrier de contact.
 */
export enum NiveauRisque {
  /** Suivi rapproché : patrimoine modeste, ou questionnaire jamais rempli. */
  VULNERABLE = 'vulnerable',
  MODERE = 'modere',
  /** Investisseur professionnel : suivi le plus espacé. */
  QUALIFIE = 'qualifie',
}
