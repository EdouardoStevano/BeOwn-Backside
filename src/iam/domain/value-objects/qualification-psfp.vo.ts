/** Étape 2 du questionnaire, telle que le formulaire l'envoie. */
export interface ChampsQualification {
  previousUnlistedInvestments?: boolean;
  investmentExperienceOver5Years?: boolean;
  financialPatrimonyOver500k?: boolean;
  understandsTotalLossRisk?: boolean;
  financialSectorBackground?: boolean;
}

export interface QualificationSnapshot {
  previousUnlistedInvestments: boolean;
  investmentExperienceOver5Years: boolean;
  financialPatrimonyOver500k: boolean;
  understandsTotalLossRisk: boolean;
  financialSectorBackground: boolean;
}

/**
 * Nombre de critères à réunir pour être classé investisseur averti.
 *
 * Quatre sur cinq. Comme le seuil de l'étape 1, il vivait en dur dans un use
 * case ; il vit désormais à côté des réponses qu'il compte.
 */
const CRITERES_AVERTI_REQUIS = 4;

/**
 * Étape 2 — qualification : expérience et compréhension du risque, qui
 * séparent l'investisseur averti du non-averti.
 *
 * Même raison d'être un bloc que `PreQualificationPsfp` : ces cinq réponses ne
 * valent que comptées ensemble.
 *
 * L'étape n'est atteinte que par ceux que l'étape 1 n'a pas classés
 * professionnels — c'est le questionnaire qui enchaîne, pas ce bloc, qui se
 * contente de savoir compter.
 *
 * **Immuable.** Une réponse absente vaut « non » (cf. `PreQualificationPsfp`).
 */
export class QualificationPsfp {
  private constructor(private readonly etat: QualificationSnapshot) {}

  static declarer(champs: ChampsQualification = {}): QualificationPsfp {
    return new QualificationPsfp(normaliser(champs));
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: QualificationSnapshot): QualificationPsfp {
    return new QualificationPsfp(normaliser(snapshot));
  }

  /** Quatre critères sur cinq — le titulaire est un investisseur averti. */
  estAverti(): boolean {
    return this.criteresReunis() >= CRITERES_AVERTI_REQUIS;
  }

  criteresReunis(): number {
    return Object.values(this.etat).filter(Boolean).length;
  }

  toSnapshot(): QualificationSnapshot {
    return { ...this.etat };
  }
}

function normaliser(champs: ChampsQualification): QualificationSnapshot {
  return {
    previousUnlistedInvestments: champs.previousUnlistedInvestments === true,
    investmentExperienceOver5Years:
      champs.investmentExperienceOver5Years === true,
    financialPatrimonyOver500k: champs.financialPatrimonyOver500k === true,
    understandsTotalLossRisk: champs.understandsTotalLossRisk === true,
    financialSectorBackground: champs.financialSectorBackground === true,
  };
}
