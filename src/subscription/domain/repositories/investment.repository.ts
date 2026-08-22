import type { Investment, InvestmentNaissant } from '../aggregates/investment';

export const INVESTMENT_REPOSITORY = Symbol('INVESTMENT_REPOSITORY');

/**
 * La collection des investissements (§10) — orientée agrégat, pas table.
 *
 * `creer` et `save` sont distincts parce que l'identité et les dates de vie
 * naissent en base : un `InvestmentNaissant` entre, un agrégat complet ressort.
 *
 * Les méthodes `updateInvestmentStatus`, `updateTopUp` et `updateBulletinDocId`
 * de l'ancien port ont disparu : c'étaient trois façons d'écrire des colonnes
 * sans passer par l'agrégat (§6) — « mettre à jour le statut » n'est pas une
 * intention métier (§4). Leurs appelants jouent désormais la transition
 * correspondante sur l'agrégat, puis le sauvent.
 *
 * Les trois méthodes d'échéancier ont disparu à leur tour : ce port servait
 * la collection d'un autre contexte, en rendant les entités d'un autre
 * modèle. La lecture est passée à `RepaymentScheduleRepository`
 * (`servicing`) ; les deux écritures n'avaient plus d'appelant — la
 * souscription persiste ses échéances par l'`EntityManager` de sa propre
 * transaction.
 *
 * Les lectures de fractions vendues restent ici bien qu'elles servent surtout
 * à peupler `CollecteCapacity` : ce sont des projections sur la collection
 * d'investissements, pas des requêtes d'une autre collection. `catalog` s'en
 * sert aussi pour son read model — c'est aujourd'hui le seul point par lequel
 * un autre contexte lit cette collection (§3.4).
 */
export interface InvestmentRepository {
  /** Insère un investissement qui vient de naître et rend l'agrégat complet. */
  creer(naissant: InvestmentNaissant): Promise<Investment>;

  /** Persiste l'état d'un investissement existant (transition jouée). */
  save(investment: Investment): Promise<Investment>;

  findById(id: string): Promise<Investment | null>;

  findByUserId(userId: number): Promise<Investment[]>;

  findByProjetId(projetId: string): Promise<Investment[]>;

  /** Somme des fractions des investissements actifs (hors RETRACTE/ANNULE). */
  countFractionsVendues(projetId: string): Promise<number>;

  /** La même somme, pour plusieurs projets d'un coup (read model de `catalog`). */
  countFractionsVenduesBatch(
    projetIds: string[],
  ): Promise<Record<string, number>>;
}
