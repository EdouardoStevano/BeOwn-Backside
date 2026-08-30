import type { EvaluationDAdequation } from '../aggregates/evaluation-d-adequation';

export const EVALUATION_ADEQUATION_REPOSITORY = Symbol(
  'EVALUATION_ADEQUATION_REPOSITORY',
);

/**
 * Accès à l'évaluation d'adéquation d'un investisseur, chargée d'un bloc.
 *
 * La racine se compose de deux tables — sa ligne propre, qui porte le
 * classement et la surveillance, et `questionnaire_adequation` — et c'est
 * l'adapter qui les réunit (§10, §16).
 *
 * **Clé sur le profil investisseur, pas sur le compte** : le classement
 * s'apprécie sur l'investisseur, et un compte en porte plusieurs depuis qu'il
 * déclare ses sociétés.
 */
export interface EvaluationDAdequationRepository {
  /**
   * L'évaluation du **titulaire lui-même**. Jamais `null` : qui n'a pas répondu
   * **est** non averti, et c'est un classement, pas une absence.
   */
  parTitulaire(investorId: number): Promise<EvaluationDAdequation>;

  /**
   * L'évaluation d'une des sociétés du titulaire.
   *
   * Elle existe parce qu'une SAS peut être professionnelle quand son dirigeant
   * est non-averti : lui opposer le classement de son représentant lui
   * imposerait un délai de rétractation qui ne la concerne pas.
   */
  parSociete(
    investorId: number,
    societeId: string,
  ): Promise<EvaluationDAdequation>;

  save(evaluation: EvaluationDAdequation): Promise<EvaluationDAdequation>;
}
