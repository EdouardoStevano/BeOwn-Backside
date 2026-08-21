/**
 * Classification de l'investisseur — règlement (UE) 2020/1503 (ECSPR).
 *
 * Domaine pur : aucune dépendance base de données, réseau ou framework.
 * Les seuils viennent directement de l'annexe II du règlement et des
 * paragraphes 5 et 7 de l'article 21. Ne pas les ajuster sans note d'ADR.
 *
 * Trois notions distinctes vivent ici, souvent confondues :
 *
 *  1. La CATÉGORIE (art. 2(1)(j) + annexe II) — averti ou non averti. Elle se
 *     démontre par des critères objectifs de revenus, patrimoine et expérience,
 *     jamais par un score à un questionnaire de connaissances.
 *  2. La SIMULATION DE CAPACITÉ DE PERTE (art. 21(5)) — 10 % du patrimoine net.
 *  3. Le SEUIL D'AVERTISSEMENT (art. 21(7)) — le plus élevé entre 1 000 € et
 *     5 % du patrimoine net. Ce n'est pas un plafond : au-delà, l'investisseur
 *     reçoit un avertissement et doit consentir explicitement.
 */

/** Art. 2(1)(j) : le règlement ne connaît que deux catégories. */
export enum CategorieInvestisseur {
  NON_AVERTI = 'non_averti',
  AVERTI = 'averti',
}

/** Art. 21(2) : l'évaluation est réexaminée tous les deux ans. */
export const DUREE_VALIDITE_EVALUATION_MOIS = 24;

/** Annexe II, partie II — personnes physiques. */
export const SEUIL_REVENU_BRUT_ANNUEL_EUR = 60_000;
export const SEUIL_PORTEFEUILLE_INSTRUMENTS_EUR = 100_000;
export const SEUIL_TRANSACTIONS_PAR_TRIMESTRE = 10;

/** Annexe II, partie I — personnes morales. */
export const SEUIL_FONDS_PROPRES_EUR = 100_000;
export const SEUIL_CHIFFRE_AFFAIRES_NET_EUR = 2_000_000;
export const SEUIL_TOTAL_BILAN_EUR = 1_000_000;

/** Art. 21(5) : la capacité de perte simulée vaut 10 % du patrimoine net. */
export const TAUX_CAPACITE_DE_PERTE = 0.1;

/** Art. 21(7) : seuil d'avertissement — max(1 000 €, 5 % du patrimoine net). */
export const SEUIL_AVERTISSEMENT_PLANCHER_EUR = 1_000;
export const TAUX_SEUIL_AVERTISSEMENT = 0.05;

// ─── Annexe II, partie II — personne physique ────────────────────────────────

export interface CriteresAvertiPersonnePhysique {
  /** Revenu brut personnel par exercice fiscal, en euros. */
  revenuBrutAnnuel: number;
  /**
   * Portefeuille d'instruments financiers, dépôts en espèces et actifs
   * financiers inclus, en euros.
   */
  portefeuilleInstrumentsFinanciers: number;
  /**
   * Travaille ou a travaillé au moins un an dans le secteur financier à un
   * poste exigeant la connaissance des opérations envisagées, ou a occupé un
   * poste de direction pendant au moins douze mois dans une personne morale
   * répondant aux critères de la partie I.
   */
  experienceProfessionnelleFinanciere: boolean;
  /**
   * Nombre moyen d'opérations de taille significative réalisées par trimestre
   * sur les marchés de capitaux au cours des quatre trimestres précédents.
   */
  transactionsMoyennesParTrimestre: number;
}

// ─── Annexe II, partie I — personne morale ───────────────────────────────────

export interface CriteresAvertiPersonneMorale {
  fondsPropres: number;
  chiffreAffairesNet: number;
  totalBilan: number;
}

export interface ResultatEligibilite {
  eligible: boolean;
  /** Libellé des critères de l'annexe II effectivement remplis. */
  criteresRemplis: string[];
  /** Nombre de critères requis par l'annexe II pour ce type d'investisseur. */
  criteresRequis: number;
}

/**
 * Annexe II, partie II : au moins deux des trois critères doivent être remplis.
 * Le premier critère est alternatif (revenu OU portefeuille) et ne compte
 * qu'une fois.
 */
export function evaluerEligibiliteAvertiPersonnePhysique(
  criteres: CriteresAvertiPersonnePhysique,
): ResultatEligibilite {
  const criteresRemplis: string[] = [];

  if (criteres.revenuBrutAnnuel >= SEUIL_REVENU_BRUT_ANNUEL_EUR) {
    criteresRemplis.push('revenu_brut_annuel');
  } else if (
    criteres.portefeuilleInstrumentsFinanciers > SEUIL_PORTEFEUILLE_INSTRUMENTS_EUR
  ) {
    criteresRemplis.push('portefeuille_instruments_financiers');
  }

  if (criteres.experienceProfessionnelleFinanciere) {
    criteresRemplis.push('experience_professionnelle_financiere');
  }

  if (
    criteres.transactionsMoyennesParTrimestre >= SEUIL_TRANSACTIONS_PAR_TRIMESTRE
  ) {
    criteresRemplis.push('transactions_significatives');
  }

  return {
    eligible: criteresRemplis.length >= 2,
    criteresRemplis,
    criteresRequis: 2,
  };
}

/**
 * Annexe II, partie I : un seul des trois critères suffit.
 */
export function evaluerEligibiliteAvertiPersonneMorale(
  criteres: CriteresAvertiPersonneMorale,
): ResultatEligibilite {
  const criteresRemplis: string[] = [];

  if (criteres.fondsPropres >= SEUIL_FONDS_PROPRES_EUR) {
    criteresRemplis.push('fonds_propres');
  }
  if (criteres.chiffreAffairesNet >= SEUIL_CHIFFRE_AFFAIRES_NET_EUR) {
    criteresRemplis.push('chiffre_affaires_net');
  }
  if (criteres.totalBilan >= SEUIL_TOTAL_BILAN_EUR) {
    criteresRemplis.push('total_bilan');
  }

  return {
    eligible: criteresRemplis.length >= 1,
    criteresRemplis,
    criteresRequis: 1,
  };
}

// ─── Art. 21(5) — simulation de capacité à supporter les pertes ──────────────

export interface BasePatrimoniale {
  /** Revenus réguliers et totaux sur l'année, en euros. */
  revenuAnnuel: number;
  /**
   * Actifs : investissements financiers, biens personnels et d'investissement,
   * fonds de pension et dépôts en espèces.
   */
  actifsTotaux: number;
  /** Engagements financiers réguliers, existants ou futurs. */
  engagementsFinanciers: number;
}

export interface ResultatSimulationPerte {
  /** Patrimoine net au sens de l'art. 21(5), plancher à zéro. */
  patrimoineNet: number;
  /** 10 % du patrimoine net. */
  capaciteDePerte: number;
  /** max(1 000 €, 5 % du patrimoine net) — art. 21(7). */
  seuilAvertissement: number;
}

/**
 * Art. 21(5) : le patrimoine net se calcule à partir des revenus, des actifs et
 * des engagements financiers. La capacité de perte simulée en représente 10 %.
 */
export function simulerCapaciteDePerte(
  base: BasePatrimoniale,
): ResultatSimulationPerte {
  const patrimoineNet = Math.max(
    0,
    base.revenuAnnuel + base.actifsTotaux - base.engagementsFinanciers,
  );

  return {
    patrimoineNet: arrondir(patrimoineNet),
    capaciteDePerte: arrondir(patrimoineNet * TAUX_CAPACITE_DE_PERTE),
    seuilAvertissement: calculerSeuilAvertissement(patrimoineNet),
  };
}

/**
 * Art. 21(7) : au-delà du plus élevé entre 1 000 € et 5 % du patrimoine net,
 * l'investisseur non averti reçoit un avertissement et doit consentir
 * explicitement. Ce n'est pas une interdiction d'investir.
 */
export function calculerSeuilAvertissement(patrimoineNet: number): number {
  return arrondir(
    Math.max(
      SEUIL_AVERTISSEMENT_PLANCHER_EUR,
      Math.max(0, patrimoineNet) * TAUX_SEUIL_AVERTISSEMENT,
    ),
  );
}

// ─── Validité de l'évaluation — art. 21(2) ───────────────────────────────────

/** Date d'expiration d'une évaluation réalisée à `evalueeLe`. */
export function calculerExpirationEvaluation(evalueeLe: Date): Date {
  const expiration = new Date(evalueeLe.getTime());
  expiration.setMonth(expiration.getMonth() + DUREE_VALIDITE_EVALUATION_MOIS);
  return expiration;
}

export function evaluationExpiree(expireLe: Date | null, maintenant: Date): boolean {
  if (!expireLe) return true;
  return maintenant.getTime() > new Date(expireLe).getTime();
}

// ─── Catégorie effective ─────────────────────────────────────────────────────

export interface DemandeStatutAverti {
  /** L'investisseur remplit les critères objectifs de l'annexe II. */
  eligible: boolean;
  /** Art. 2(1)(j) : l'investisseur a expressément demandé ce traitement. */
  demandeExpresse: boolean;
  /** L'investisseur a accusé réception de l'avertissement sur la perte de protection. */
  avertissementAccepte: boolean;
}

/**
 * Un investisseur n'est averti que si les trois conditions sont réunies :
 * éligibilité objective, demande expresse et acceptation de l'avertissement.
 * Le défaut est toujours « non averti », y compris quand l'évaluation a expiré.
 */
export function determinerCategorie(
  demande: DemandeStatutAverti,
): CategorieInvestisseur {
  const averti =
    demande.eligible && demande.demandeExpresse && demande.avertissementAccepte;
  return averti ? CategorieInvestisseur.AVERTI : CategorieInvestisseur.NON_AVERTI;
}

function arrondir(montant: number): number {
  return Math.round(montant * 100) / 100;
}
