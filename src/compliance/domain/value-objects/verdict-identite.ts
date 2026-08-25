/**
 * Ce qu'un fournisseur de vérification d'identité nous apprend sur un dossier.
 *
 * Trois faits, et non trois noms d'événements Stripe : `verified`,
 * `processing` et `requires_input` sont le vocabulaire d'un prestataire, qui
 * peut être remplacé (Smile Identity, Onfido — §3.1). Le domaine parle de ce
 * qui s'est passé, l'{@link EvenementIdentiteTranslator} fait la traduction.
 */
export enum VerdictIdentite {
  /** L'identité est établie automatiquement, sans intervention humaine. */
  VERIFIEE = 'VERIFIEE',
  /** Les pièces ont été capturées, l'analyse est en cours. */
  EN_TRAITEMENT = 'EN_TRAITEMENT',
  /** Le fournisseur n'a pas tranché : un humain doit reprendre le dossier. */
  REVUE_REQUISE = 'REVUE_REQUISE',
}

/**
 * Ce que le dossier fait d'un verdict qu'on lui présente.
 *
 * Trois issues, et pas un booléen, parce que « rien ne se passe » recouvre
 * deux situations que l'exploitation ne doit pas confondre :
 *
 * - {@link DEJA_APPLIQUE} — le fournisseur redélivre un verdict déjà pris en
 *   compte. Normal, silencieux, rien à surveiller.
 * - {@link ECARTE} — le verdict arrive **après** que le dossier a évolué
 *   autrement, typiquement une décision manuelle du RCCI. C'est le cas qui
 *   mérite une alerte : un `VERIFIEE` tardif sur un dossier refusé signale un
 *   désaccord entre le fournisseur et la décision humaine.
 */
export enum SuiteDuVerdict {
  A_APPLIQUER = 'A_APPLIQUER',
  DEJA_APPLIQUE = 'DEJA_APPLIQUE',
  ECARTE = 'ECARTE',
}
