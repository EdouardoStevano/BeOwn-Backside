/**
 * Le dossier de justificatifs d'une société réunit tout ce que le régulateur
 * exige.
 *
 * Le fait, et non la décision qui s'ensuit : ce que le dossier constate, c'est
 * qu'il ne manque plus rien — immatriculation, statuts, actionnaires, et une
 * pièce d'identité par bénéficiaire effectif déclaré. Ce que la conformité en
 * conclura est l'affaire de {@link DossierDEntreeEnRelation}, qui s'y abonne
 * sans que `DossierDePieces` sache qu'elle existe (§12).
 *
 * **C'est ce qui remplace le calcul refait à chaque lecture.**
 * `aptitudeDeLaSociete` recomposait la complétude à chaque appel, si bien
 * qu'elle n'était jamais *constatée* à un instant donné : personne ne pouvait
 * dire quand un dossier était devenu complet, ni ce qui avait suivi.
 *
 * Il porte le compte **et** la société : le dossier de conformité d'une société
 * est clé sur les deux (`parSociete(investorId, societeId)`), et faire retrouver
 * le titulaire à l'abonné l'obligerait à relire un profil moral qui ne le
 * regarde pas.
 */
export class DossierDePiecesCompleteDomainEvent {
  constructor(
    /** Le compte qui a déclaré la société. */
    public readonly utilisateurId: number,
    public readonly societeId: string,
  ) {}
}
