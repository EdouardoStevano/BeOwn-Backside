/**
 * Où en est le dossier de conformité d'une **société** — son KYB.
 *
 * Un enum distinct de {@link KycStatus}, et non une réutilisation. Les deux
 * décrivent bien « où en est un dossier », mais pas le même dossier ni le même
 * parcours : le KYC est tranché par Stripe Identity et ne connaît que des
 * verdicts de fournisseur, le KYB est constitué pièce à pièce par le titulaire
 * puis instruit par l'équipe conformité. Partager l'enum ferait entrer les
 * statuts `RENOUVELLEMENT` et `EXPIRE` — réservés à la re-vérification
 * d'identité périodique — dans un dossier qui n'a pas d'identité à vérifier.
 *
 * Quatre états, et pas d'`INCOMPLET` : ce que le dossier réunit ou non se lit
 * déjà sur `DossierDePieces.piecesManquantes()`, et l'inscrire ici le mettrait
 * en double, avec la divergence que cela suppose.
 */
export enum StatutKyb {
  /**
   * Le dossier se constitue encore : des pièces manquent, ou l'une d'elles
   * vient d'être refusée ou remplacée.
   *
   * C'est l'état initial **et** l'état de retour. Un dossier qu'une pièce
   * refusée fait retomber ici n'est pas « jamais démarré » — le titulaire a
   * déjà déposé, il lui reste à corriger — et c'est pourquoi ce statut ne
   * s'appelle pas `NON_DEMARRE`.
   */
  EN_CONSTITUTION = 'en_constitution',

  /**
   * Le dossier réunit toutes ses pièces et attend la décision de l'équipe
   * conformité.
   *
   * **Complet n'est pas validé** : c'est la distinction que cet état existe
   * pour tenir. Valider dès la complétude reviendrait à faire dire au dossier
   * qu'il a été instruit alors que personne ne l'a lu.
   */
  EN_INSTRUCTION = 'en_instruction',

  /** La société peut réaliser des opérations financières, jusqu'à l'échéance. */
  VALIDE = 'valide',

  /** L'équipe conformité a rejeté le dossier, motif à l'appui. */
  REFUSE = 'refuse',
}
