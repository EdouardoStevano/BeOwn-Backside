/**
 * Test de connaissances à l'entrée — art. 21(1) à 21(4) du règlement (UE) 2020/1503,
 * précisé par le règlement délégué (UE) 2022/2114.
 *
 * Domaine pur. Trois règles y sont non négociables :
 *
 *  1. Le test s'adresse aux investisseurs NON AVERTIS. Il n'attribue aucun
 *     statut : réussir le test ne rend personne « averti ».
 *  2. Un échec N'INTERDIT PAS d'investir (art. 21(4)). Il déclenche un
 *     avertissement explicite sur le risque de perte totale, dont
 *     l'investisseur doit accuser réception.
 *  3. L'évaluation est réexaminée tous les deux ans (art. 21(2)).
 */

import { DUREE_VALIDITE_EVALUATION_MOIS } from './investor-classification';

export { DUREE_VALIDITE_EVALUATION_MOIS };

/**
 * Seuil au-dessous duquel la plateforme considère les connaissances
 * insuffisantes et déclenche l'avertissement d'inadéquation de l'art. 21(4).
 */
export const SEUIL_ADEQUATION = 0.7;

/** Domaines que le règlement délégué 2022/2114 impose de couvrir. */
export enum DomaineTestConnaissances {
  TYPES_INVESTISSEMENTS = 'types_investissements',
  RISQUES = 'risques',
  EXPERIENCE_ANTERIEURE = 'experience_anterieure',
  OBJECTIFS_INVESTISSEMENT = 'objectifs_investissement',
  SITUATION_FINANCIERE = 'situation_financiere',
  COMPREHENSION_RISQUE_PERTE = 'comprehension_risque_perte',
}

export interface ResultatTestConnaissances {
  score: number;
  total: number;
  ratio: number;
  /** Faux quand le score est sous le seuil : déclenche l'avertissement art. 21(4). */
  adequat: boolean;
  /**
   * L'investisseur doit accuser réception de l'avertissement avant de pouvoir
   * investir. L'accusé de réception ne conditionne jamais l'accès : il est
   * exigé pour tracer que l'avertissement a bien été porté à sa connaissance.
   */
  avertissementRequis: boolean;
  /** Domaines du règlement délégué 2022/2114 non couverts par le test soumis. */
  domainesManquants: DomaineTestConnaissances[];
}

/**
 * Évalue un test soumis. `domainesCouverts` permet de vérifier que le
 * questionnaire administré couvre bien les six domaines exigés : un test
 * incomplet est un défaut de conformité, pas un échec de l'investisseur.
 */
export function evaluerTestConnaissances(
  score: number,
  total: number,
  domainesCouverts: DomaineTestConnaissances[] = [],
): ResultatTestConnaissances {
  if (total <= 0) {
    throw new Error('Le test de connaissances doit comporter au moins une question.');
  }
  if (score < 0 || score > total) {
    throw new Error('Score hors bornes pour le test de connaissances.');
  }

  const ratio = score / total;
  const adequat = ratio >= SEUIL_ADEQUATION;

  const domainesManquants = Object.values(DomaineTestConnaissances).filter(
    (domaine) => !domainesCouverts.includes(domaine),
  );

  return {
    score,
    total,
    ratio: Math.round(ratio * 10000) / 10000,
    adequat,
    avertissementRequis: !adequat,
    domainesManquants,
  };
}

/**
 * Art. 21(4) : formulation de l'avertissement remis quand les connaissances
 * sont jugées insuffisantes ou quand l'investisseur refuse de fournir les
 * informations demandées.
 */
export const AVERTISSEMENT_INADEQUATION =
  "Au vu des informations que vous avez fournies, les services proposés sur cette " +
  "plateforme sont susceptibles de ne pas être appropriés à votre situation. " +
  "Vous encourez le risque de perdre la totalité des sommes investies. " +
  "Vous restez libre d'investir, mais vous le faites en pleine connaissance de ce risque.";
