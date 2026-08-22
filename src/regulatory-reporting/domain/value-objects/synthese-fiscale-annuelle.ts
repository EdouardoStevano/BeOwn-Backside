/**
 * Une ligne de revenu imposable, quelle qu'en soit la source : un coupon
 * obligataire réglé par `servicing`, une part de distribution versée par
 * `distributions`.
 *
 * Le `net` est fourni par l'appelant, et ce n'est pas un oubli : les deux
 * sources ne l'obtiennent pas de la même façon — l'une le porte en colonne, et
 * fait foi ; l'autre le déduit du brut. Le recalculer ici imposerait une
 * formule à des montants déjà arrêtés ailleurs, ce que ce contexte ne doit
 * précisément pas faire (§3.3).
 */
export interface LigneImposable {
  /** Revenu brut de la ligne — intérêts, ou part de revenu locatif. */
  brut: number;
  prelevementIR: number;
  prelevementCSG: number;
  /** Ce qui a été effectivement crédité au bénéficiaire. */
  net: number;
}

/**
 * **Synthèse fiscale annuelle** — ce qu'un investisseur a perçu sur une année
 * civile, et ce qui lui a été retenu à la source.
 *
 * Value Object immuable (§8) : quatre totaux et un compte, définis par leur
 * valeur, sans identité. C'est le seul concept que ce contexte modélise
 * vraiment — et c'est voulu. §3.3 et §44 lui demandent des projections, pas des
 * agrégats riches : les montants qu'il additionne ont **déjà** été calculés par
 * `servicing` (RG-ECH-04/05) et par `distributions`, et les recalculer ici
 * serait la faute que ces sections nomment.
 *
 * Ce qui appartient donc à ce contexte, c'est l'addition et l'arrondi — et rien
 * d'autre. Ils étaient écrits deux fois, différemment : quatre `reduce` et un
 * `round2` local dans `GenerateInvestisseurIfuUseCase`, une accumulation à la
 * main dans une `Map` sans arrondi dans `IfuGenerationService`, dont le net se
 * redéduisait une troisième fois au moment d'imprimer le PDF.
 */
export class SyntheseFiscaleAnnuelle {
  private constructor(
    readonly annee: number,
    readonly montantBrut: number,
    readonly montantIR: number,
    readonly montantCSG: number,
    readonly montantNet: number,
    /** Nombre de versements cumulés — ce que l'IFU affiche au bénéficiaire. */
    readonly nbLignes: number,
  ) {}

  /** Cumule les versements d'une année. Une liste vide donne une synthèse vide. */
  static cumuler(
    annee: number,
    lignes: readonly LigneImposable[],
  ): SyntheseFiscaleAnnuelle {
    return new SyntheseFiscaleAnnuelle(
      annee,
      round2(somme(lignes, (l) => l.brut)),
      round2(somme(lignes, (l) => l.prelevementIR)),
      round2(somme(lignes, (l) => l.prelevementCSG)),
      round2(somme(lignes, (l) => l.net)),
      lignes.length,
    );
  }

  /** Une année sans aucun versement. */
  static vide(annee: number): SyntheseFiscaleAnnuelle {
    return SyntheseFiscaleAnnuelle.cumuler(annee, []);
  }
}

const somme = (
  lignes: readonly LigneImposable[],
  de: (ligne: LigneImposable) => number,
): number => lignes.reduce((total, ligne) => total + de(ligne), 0);

const round2 = (montant: number): number => Math.round(montant * 100) / 100;
