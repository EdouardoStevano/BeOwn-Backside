/**
 * Le dossier de justificatifs d'une société ne réunit plus ce que le régulateur
 * exige.
 *
 * Le pendant de {@link DossierDePiecesCompleteDomainEvent}, et il compte
 * autant : c'est **le seul chemin par lequel un KYB validé se révoque** avant
 * son échéance. Sans lui, une société pourrait remplacer son KBIS par un
 * document illisible après validation et rester habilitée à souscrire —
 * exactement le trou que le verdict recalculé à la lecture bouchait par
 * accident, et qu'un verdict figé rouvrirait si rien ne le défaisait.
 *
 * Trois gestes le produisent : une pièce refusée, une pièce redéposée (son
 * instruction repart de zéro), un bénéficiaire déclaré dont la pièce d'identité
 * manque encore.
 *
 * Il porte **le motif**, comme `PieceJustificativeRefusee` et pour la même
 * raison : c'est ce que le titulaire lira, et le faire reconstituer par
 * l'abonné l'obligerait à rejouer la règle de complétude qui vient d'être
 * évaluée.
 */
export class DossierDePiecesIncompletDomainEvent {
  constructor(
    /** Le compte qui a déclaré la société. */
    public readonly utilisateurId: number,
    public readonly societeId: string,
    /** Ce qui manque, dit en clair — repris tel quel sur le dossier KYB. */
    public readonly motif: string,
  ) {}
}
