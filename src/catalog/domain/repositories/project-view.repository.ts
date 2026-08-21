export const PROJECT_VIEW_REPOSITORY = Symbol('PROJECT_VIEW_REPOSITORY');

/**
 * Trace des consultations du détail d'un projet par un investisseur.
 *
 * `ProjectController` s'en occupait lui-même, en injectant un
 * `Repository<ProjectViewEntity>` TypeORM à même la couche présentation
 * (§12.9) : un contrôleur qui crée sa ligne, la recompte et décide d'alerter.
 * Le port existe pour que ce comptage redevienne une décision applicative.
 */
export interface ProjectViewRepository {
  /**
   * Enregistre une consultation et rend le nombre total de consultations de ce
   * projet par ce compte, la nouvelle comprise.
   *
   * Les deux opérations sont exposées ensemble parce que l'appelant ne se sert
   * jamais de l'une sans l'autre : c'est le compte atteint qui décide d'alerter
   * le chargé de relation, et les séparer laisserait au use case le soin de
   * réaccorder une écriture et une lecture qui doivent se suivre.
   */
  enregistrerEtCompter(
    utilisateurId: number,
    projetId: string,
  ): Promise<number>;
}
