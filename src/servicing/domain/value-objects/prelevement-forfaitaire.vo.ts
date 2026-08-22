/**
 * **Prélèvement Forfaitaire Unique (PFU, « flat tax » 30 %)** — la retenue à
 * la source appliquée au règlement d'un coupon (RG-ECH-04/05).
 *
 * Value Object immuable (§8) : deux taux, une assiette, trois montants qui en
 * découlent. La règle fiscale est ici, et nulle part ailleurs — elle vivait
 * en quatre lignes au milieu de `PayEcheanceUseCase`, entre un verrou
 * pessimiste et une écriture de ledger (§14 : l'application orchestre, elle ne
 * calcule pas).
 *
 * Deux propriétés de ce calcul méritent d'être explicites, parce qu'elles ne
 * se déduisent pas des taux :
 *
 * - **l'assiette n'est pas le total.** IR et CSG portent sur les seuls
 *   intérêts ; le capital remboursé n'est pas un revenu et n'est pas taxé ;
 * - **le net se déduit du total, pas des intérêts.** L'investisseur perçoit
 *   son capital plus ses intérêts nets — d'où `total − IR − CSG`.
 *
 * Les taux sont figés dans le code : ce sont des constantes de la loi fiscale
 * française à ce jour, pas un paramètre métier de la plateforme. Le jour où
 * ils bougent (ou se différencient par résidence fiscale), ce VO devient une
 * Policy injectable (§22) — le reste du contexte n'aura pas à changer.
 */
export class PrelevementForfaitaire {
  /** Impôt sur le revenu — 12,8 % des intérêts. */
  static readonly TAUX_IR = 0.128;
  /** Prélèvements sociaux CSG/CRDS — 17,2 % des intérêts. */
  static readonly TAUX_CSG = 0.172;

  private constructor(
    readonly interetsBruts: number,
    readonly prelevementIR: number,
    readonly prelevementCSG: number,
    readonly montantNet: number,
  ) {}

  /**
   * Applique le PFU à une échéance : `interets` porte l'assiette taxable,
   * `montantTotal` ce que l'échéance verserait sans retenue.
   */
  static surEcheance(
    interets: number,
    montantTotal: number,
  ): PrelevementForfaitaire {
    const prelevementIR = round2(interets * PrelevementForfaitaire.TAUX_IR);
    const prelevementCSG = round2(interets * PrelevementForfaitaire.TAUX_CSG);

    return new PrelevementForfaitaire(
      interets,
      prelevementIR,
      prelevementCSG,
      montantTotal - prelevementIR - prelevementCSG,
    );
  }

  /** Retenue totale à la source, reversée aux wallets séquestres. */
  get prelevementTotal(): number {
    return this.prelevementIR + this.prelevementCSG;
  }
}

const round2 = (montant: number): number => Math.round(montant * 100) / 100;
