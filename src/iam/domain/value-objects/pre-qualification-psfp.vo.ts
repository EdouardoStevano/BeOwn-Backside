/** Étape 1 du questionnaire, telle que le formulaire l'envoie. */
export interface ChampsPreQualification {
  workInFinancialSector?: boolean;
  moreThan10TransactionsPerQuarter?: boolean;
  portfolioOver500k?: boolean;
}

export interface PreQualificationSnapshot {
  workInFinancialSector: boolean;
  moreThan10TransactionsPerQuarter: boolean;
  portfolioOver500k: boolean;
}

/**
 * Nombre de critères à réunir pour être reconnu investisseur professionnel.
 *
 * Deux sur trois — seuil du règlement PSFP (UE 2020/1503, annexe II). Il était
 * écrit `>= 2` au milieu d'un use case, sans rien qui dise d'où il venait.
 */
const CRITERES_PROFESSIONNEL_REQUIS = 2;

/**
 * Étape 1 — pré-qualification : les trois critères qui font, ou non, un
 * investisseur professionnel.
 *
 * Les trois réponses forment un bloc parce qu'elles ne s'interprètent que
 * **comptées ensemble** : prise isolée, aucune ne dit rien, et c'est leur
 * total qui franchit ou non le seuil réglementaire. Séparées, le seuil aurait
 * dû être appliqué par l'appelant — c'est-à-dire n'importe où.
 *
 * **Immuable** — cf. `Identite`. Une réponse absente vaut « non » : le
 * formulaire est soumis d'un bloc, et un critère qu'on n'a pas revendiqué n'est
 * pas acquis. C'est aussi ce que fait la colonne, qui vaut `false` par défaut.
 */
export class PreQualificationPsfp {
  private constructor(private readonly etat: PreQualificationSnapshot) {}

  static declarer(champs: ChampsPreQualification = {}): PreQualificationPsfp {
    return new PreQualificationPsfp({
      workInFinancialSector: champs.workInFinancialSector === true,
      moreThan10TransactionsPerQuarter:
        champs.moreThan10TransactionsPerQuarter === true,
      portfolioOver500k: champs.portfolioOver500k === true,
    });
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: PreQualificationSnapshot): PreQualificationPsfp {
    return new PreQualificationPsfp({
      workInFinancialSector: snapshot.workInFinancialSector === true,
      moreThan10TransactionsPerQuarter:
        snapshot.moreThan10TransactionsPerQuarter === true,
      portfolioOver500k: snapshot.portfolioOver500k === true,
    });
  }

  /**
   * Deux critères sur trois suffisent — le titulaire est alors professionnel,
   * et les étapes suivantes ne le concernent plus : ni plafond conseillé, ni
   * délai de rétractation.
   */
  estProfessionnel(): boolean {
    return this.criteresReunis() >= CRITERES_PROFESSIONNEL_REQUIS;
  }

  /** Rendu au titulaire : à un critère près, il change de catégorie. */
  criteresReunis(): number {
    return [
      this.etat.workInFinancialSector,
      this.etat.moreThan10TransactionsPerQuarter,
      this.etat.portfolioOver500k,
    ].filter(Boolean).length;
  }

  toSnapshot(): PreQualificationSnapshot {
    return { ...this.etat };
  }
}
