import { CategoriePsfp } from 'src/profiles/domains/enums/kyc-status.enum';

/**
 * Plancher du plafond conseillé aux investisseurs non avertis : le règlement
 * PSFP autorise 1 000 € même quand 5 % du patrimoine déclaré est inférieur.
 */
export const PLANCHER_PLAFOND_NON_AVERTI = 1_000;

/** Part du patrimoine déclaré au-delà de laquelle l'investissement est déconseillé. */
const PART_PATRIMOINE_CONSEILLEE = 0.05;

export interface EvaluationInvestisseurSnapshot {
  categoriePsfp: CategoriePsfp;
  patrimoineDeclare: number | null;
  montantMaxConseille: number | null;
  niveauRisque: string | null;
  dernierContactAdmin: Date | null;
  prochainContactDu: Date | null;
}

/** Les colonnes `decimal` reviennent en chaîne du driver Postgres. */
export interface EvaluationInvestisseurSnapshotBrut extends Omit<
  EvaluationInvestisseurSnapshot,
  'patrimoineDeclare' | 'montantMaxConseille'
> {
  patrimoineDeclare: number | string | null;
  montantMaxConseille: number | string | null;
}

/**
 * Résultat de l'évaluation réglementaire de l'investisseur : classement PSFP,
 * capacité financière déclarée, niveau de risque et calendrier de contact.
 *
 * **Ce bloc est en lecture seule pour le profil.** Il n'a ni `avec()` ni
 * setter, et c'est le point : ces valeurs sont produites ailleurs — la
 * catégorie et les montants par `SaveQuestionnaireUseCase`, le niveau de risque
 * et les dates de contact par `RiskScoringService`, tous deux écrivant
 * directement en base. Les rendre modifiables depuis le profil ouvrirait deux
 * portes : une mise à jour d'adresse écrasant un classement calculé
 * entre-temps, et surtout la possibilité de se déclarer « professionnel » sans
 * jamais répondre au questionnaire d'adéquation — donc de se soustraire au
 * délai de rétractation et au plafond d'investissement.
 *
 * Les regrouper dans un objet nommé rend cette frontière visible : ce qui entre
 * ici n'entre que par {@link restore}.
 */
export class EvaluationInvestisseur {
  private constructor(private readonly etat: EvaluationInvestisseurSnapshot) {}

  /**
   * Évaluation d'un profil qui vient de naître : aucune donnée, et le
   * classement le plus protecteur.
   *
   * `NON_AVERTI` n'est pas un défaut technique mais une décision : c'est le
   * seul classement qu'un investisseur puisse avoir tant qu'il n'a pas répondu
   * au questionnaire. Se tromper dans ce sens le gêne — délai de rétractation
   * de 4 jours, plafond conseillé ; se tromper dans l'autre le prive d'une
   * protection à laquelle il a droit.
   */
  static initiale(): EvaluationInvestisseur {
    return new EvaluationInvestisseur({
      categoriePsfp: CategoriePsfp.NON_AVERTI,
      patrimoineDeclare: null,
      montantMaxConseille: null,
      niveauRisque: null,
      dernierContactAdmin: null,
      prochainContactDu: null,
    });
  }

  static restore(
    snapshot: EvaluationInvestisseurSnapshotBrut,
  ): EvaluationInvestisseur {
    return new EvaluationInvestisseur({
      categoriePsfp: snapshot.categoriePsfp,
      patrimoineDeclare: nombreOuNull(snapshot.patrimoineDeclare),
      montantMaxConseille: nombreOuNull(snapshot.montantMaxConseille),
      niveauRisque: snapshot.niveauRisque,
      dernierContactAdmin: snapshot.dernierContactAdmin,
      prochainContactDu: snapshot.prochainContactDu,
    });
  }

  /**
   * Investisseur non averti au sens PSFP : plafond conseillé et délai de
   * rétractation de 4 jours s'appliquent.
   *
   * La comparaison littérale `categoriePsfp === 'non_averti'` était recopiée
   * chez l'appelant, à côté de l'énumération plutôt que dessus : renommer une
   * valeur n'aurait rien cassé à la compilation, seulement en production.
   */
  estNonAverti(): boolean {
    return this.etat.categoriePsfp === CategoriePsfp.NON_AVERTI;
  }

  estProfessionnel(): boolean {
    return this.etat.categoriePsfp === CategoriePsfp.PROFESSIONNEL;
  }

  /**
   * Montant conseillé par investissement : le plus élevé du plancher
   * réglementaire et de 5 % du patrimoine déclaré. `null` pour qui n'est pas
   * non averti — la recommandation ne le concerne pas.
   *
   * Ce calcul vivait dans `create-investment.usecase`, à côté du contrôle de
   * disponibilité des fractions et de la création de l'investissement. C'est
   * une règle du profil, pas de la souscription : elle ne dépend que de la
   * catégorie et du patrimoine.
   */
  plafondConseille(): number | null {
    if (!this.estNonAverti()) return null;
    return Math.max(
      PLANCHER_PLAFOND_NON_AVERTI,
      (this.etat.patrimoineDeclare ?? 0) * PART_PATRIMOINE_CONSEILLEE,
    );
  }

  get categoriePsfp(): CategoriePsfp {
    return this.etat.categoriePsfp;
  }
  get patrimoineDeclare(): number | null {
    return this.etat.patrimoineDeclare;
  }
  get montantMaxConseille(): number | null {
    return this.etat.montantMaxConseille;
  }
  get niveauRisque(): string | null {
    return this.etat.niveauRisque;
  }
  get dernierContactAdmin(): Date | null {
    return this.etat.dernierContactAdmin;
  }
  get prochainContactDu(): Date | null {
    return this.etat.prochainContactDu;
  }

  toSnapshot(): EvaluationInvestisseurSnapshot {
    return { ...this.etat };
  }
}

/**
 * Les colonnes `decimal` reviennent en chaîne : le driver refuse de convertir
 * en `number` pour ne pas perdre de précision. Une chaîne illisible vaut « non
 * renseigné » plutôt qu'un `NaN` qui se propagerait jusqu'au plafond
 * d'investissement.
 */
function nombreOuNull(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const valeur = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(valeur) ? valeur : null;
}
