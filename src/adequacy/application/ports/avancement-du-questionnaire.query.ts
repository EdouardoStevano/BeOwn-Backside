import { ClassementPsfpSnapshot } from 'src/adequacy/domain/value-objects/classement-psfp.vo';
import { CategoriePsfp } from 'src/adequacy/domain/enums/categorie-psfp.enum';
import { EtapeQuestionnaire } from 'src/adequacy/domain/enums/etape-questionnaire.enum';

export const AVANCEMENT_DU_QUESTIONNAIRE_QUERY = Symbol(
  'AVANCEMENT_DU_QUESTIONNAIRE_QUERY',
);

/**
 * Ces trois types traversent la frontière avec ce port : ce sont des
 * **primitives publiées**, non l'agrégat (§11). Le snapshot est un objet plat
 * de deux nombres et d'une catégorie, `EtapeQuestionnaire` l'énumération des
 * trois étapes que le front affiche déjà, et `CategoriePsfp` le vocabulaire du
 * règlement 2020/1503 — le même que réexporte `ClassementDuTitulaireQuery`, et
 * pour la même raison.
 */
export type { ClassementPsfpSnapshot };
export { EtapeQuestionnaire, CategoriePsfp };

/** Où en est le questionnaire d'un titulaire, et ce qu'il lui a valu. */
export interface AvancementDuQuestionnaire {
  /**
   * Le classement PSFP opposable — jamais `null` : qui n'a pas répondu **est**
   * non averti.
   */
  classement: ClassementPsfpSnapshot;
  /** L'étape qui vient, `null` quand le parcours est clos. */
  etapeSuivante: EtapeQuestionnaire | null;
  /** Celles déjà franchies, dans l'ordre du parcours. */
  etapesRepondues: EtapeQuestionnaire[];
}

/**
 * Ce que l'entrée en relation lit du questionnaire pour publier l'avancement du
 * parcours.
 *
 * **Deuxième et dernière arête vers ce contexte**, à côté de
 * `ClassementDuTitulaireQuery`. Elle existe parce que le parcours d'entrée en
 * relation se raconte d'un seul tenant au titulaire — identité vérifiée,
 * questionnaire répondu, dossier complet — alors que ses trois étapes
 * appartiennent à deux contextes. C'est une **projection** (§11) : l'entrée en
 * relation reçoit trois valeurs déjà calculées et n'en dérive rien.
 *
 * **Il publie aussi le classement**, qui est ce à quoi le parcours aboutit :
 * l'écran du profil personne physique l'affiche tel quel, à côté des étapes.
 * C'est le snapshot brut — trois valeurs déclarées — et non le verdict
 * opposable de `ClassementDuTitulaireQuery`, qui tait le plafond à qui n'est pas
 * non averti. Deux ports plutôt qu'un parce que les clients diffèrent : celui-ci
 * sert des écrans, l'autre une décision opposable à une souscription (§40, ISP).
 */
export interface AvancementDuQuestionnaireQuery {
  duTitulaire(investorId: number): Promise<AvancementDuQuestionnaire>;
}
