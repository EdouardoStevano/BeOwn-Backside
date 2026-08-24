/**
 * Une ligne de revenu imposable : aujourd'hui un coupon obligataire réglé par
 * `servicing`, seule source de revenu de la plateforme (§1.4.3 — BeOwn est
 * exclusivement obligataire).
 *
 * Le `net` reste fourni par l'appelant plutôt que déduit du brut, et ce n'est
 * pas un oubli : le recalculer ici imposerait une formule à des montants déjà
 * arrêtés ailleurs, ce que ce contexte ne doit précisément pas faire (§3.3).
 * Une source qui porterait son net en colonne — et ferait foi — s'ajouterait
 * sans toucher à ce calcul.
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
 * `servicing` (RG-ECH-04/05), et les recalculer ici serait la faute que ces
 * sections nomment.
 *
 * Ce qui appartient donc à ce contexte, c'est l'addition et l'arrondi — et rien
 * d'autre. Ils étaient écrits deux fois, différemment, du temps où deux chaînes
 * IFU coexistaient : une accumulation à la main dans une `Map` sans arrondi
 * d'un côté, quatre `reduce` et un `round2` local de l'autre. La seconde est
 * partie avec la ligne de produit locative ; l'objet reste, parce que
 * l'addition annuelle est un concept du contexte, pas un détail de l'une des
 * deux implémentations.
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
