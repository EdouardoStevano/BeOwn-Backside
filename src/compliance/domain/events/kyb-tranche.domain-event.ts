/**
 * L'équipe conformité a validé le dossier KYB d'une société.
 *
 * Le pendant moral de `KycValideDomainEvent`, et il annonce la même chose pour
 * l'autre nature de souscripteur : ce profil peut désormais réaliser des
 * opérations financières.
 *
 * `valideJusquAu` voyage avec, parce que c'est la moitié de l'information utile
 * au titulaire — « votre société est habilitée » sans dire jusqu'à quand
 * l'oblige à revenir le demander.
 */
export class KybValideDomainEvent {
  constructor(
    /** Le compte qui a déclaré la société — celui qu'on prévient. */
    public readonly utilisateurId: number,
    public readonly societeId: string,
    /** Date civile `AAAA-MM-JJ`, ou `null` pour une validité sans terme. */
    public readonly valideJusquAu: string | null,
    /** Compte de l'agent conformité qui tranche — tracé pour l'audit. */
    public readonly decidePar: number,
  ) {}
}

/**
 * L'équipe conformité a rejeté le dossier KYB d'une société.
 *
 * Distinct du refus d'une **pièce** (`PieceJustificativeRefusee`), et les deux
 * coexistent sans faire double emploi : l'un dit quel document reprendre,
 * celui-ci dit que le dossier entier a été examiné et écarté. Un titulaire dont
 * toutes les pièces sont acceptées peut voir son dossier rejeté — incohérence
 * entre le registre et les statuts, actionnariat qui ne se recoupe pas — et
 * aucun refus de pièce ne le lui aurait appris.
 */
export class KybRefuseDomainEvent {
  constructor(
    public readonly utilisateurId: number,
    public readonly societeId: string,
    public readonly motif: string,
    public readonly decidePar: number,
  ) {}
}
