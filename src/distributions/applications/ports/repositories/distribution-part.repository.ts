import type { EntityManager } from 'typeorm';
import { DistributionPart } from '../../../domains/distribution-part';

export const DISTRIBUTION_PART_REPOSITORY = Symbol(
  'DISTRIBUTION_PART_REPOSITORY',
);

export interface DistributionPartRepository {
  saveAll(parts: DistributionPart[]): Promise<DistributionPart[]>;
  findByPeriode(periodeDistributionId: string): Promise<DistributionPart[]>;
  findByInvestissement(investissementId: string): Promise<DistributionPart[]>;
  findByInvestissementIds(
    investissementIds: string[],
  ): Promise<DistributionPart[]>;
  findUnpaid(): Promise<DistributionPart[]>;
  /**
   * `manager` optionnel : quand il est fourni, l'écriture PARTICIPE à la
   * transaction de l'appelant. Sans lui, `markPaid` s'exécutait sur la
   * connexion par défaut, donc HORS de la transaction de distribution : une
   * panne au milieu du parcours laissait des parts marquées payées alors que
   * les crédits correspondants venaient d'être annulés — le rejeu les sautait,
   * et l'investisseur n'était jamais payé.
   */
  markPaid(id: string, payeLe: Date, manager?: EntityManager): Promise<void>;

  /**
   * Identifiants des investisseurs ayant perçu au moins une part de
   * distribution PAYÉE sur l'année civile `annee` (bornes UTC, borne haute
   * exclusive). Résultat dédupliqué et trié.
   *
   * POURQUOI un port dédié plutôt qu'une agrégation applicative : la question
   * posée par la génération des IFU est « qui a été payé sur l'exercice ? ».
   * C'est une question de base de données — une jointure part → investissement
   * avec DISTINCT — et non un parcours en mémoire. Charger les parts puis
   * résoudre chaque investissement un par un produisait un N+1, et la version
   * précédente ne parcourait que des parts NON payées : l'ensemble était vide
   * par construction et aucun IFU n'était jamais généré.
   */
  findUtilisateurIdsAvecPartPayeeSurAnnee(annee: number): Promise<number[]>;
}
