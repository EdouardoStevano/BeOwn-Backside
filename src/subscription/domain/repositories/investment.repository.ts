import type { Investment, InvestmentNaissant } from '../aggregates/investment';
import type { Echeance, EcheanceNaissante } from 'src/servicing/domain/entities/echeance';

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

  // ── Échéancier ────────────────────────────────────────────────────────────
  // Entités internes de l'agrégat, mais persistées en lot : un échéancier se
  // régénère entièrement quand le capital souscrit change.

  saveEcheances(echeances: EcheanceNaissante[]): Promise<Echeance[]>;

  deleteEcheancesByInvestissementId(investissementId: string): Promise<void>;

  findEcheancesByInvestissement(investissementId: string): Promise<Echeance[]>;
}
