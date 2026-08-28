import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { AdequacyAssessmentSnapshot } from 'src/compliance/domain/entities/adequacy-assessment';
import { EtapeQuestionnaire } from 'src/compliance/domain/enums/etape-questionnaire.enum';

/**
 * Le questionnaire **et où en est son parcours**.
 *
 * C'est ce qui manquait au front. Il recevait le questionnaire seul — ou `null`
 * — et devait en déduire quelle étape afficher, ce qui suppose de connaître les
 * seuils du règlement (deux critères sur trois, quatre sur cinq) et de savoir
 * qu'un professionnel n'a pas d'étape suivante. Autant de règles réglementaires
 * réimplémentées côté client, où rien ne les éprouve.
 *
 * `etapeSuivante` les porte à sa place, et `etapesRepondues` donne de quoi
 * dessiner le fil d'Ariane sans relire les réponses.
 */
export interface VueQuestionnaire {
  /** `null` tant que le titulaire n'a répondu à aucune étape. */
  questionnaire: AdequacyAssessmentSnapshot | null;
  /** L'étape à poser maintenant ; `null` quand le questionnaire est clos. */
  etapeSuivante: EtapeQuestionnaire | null;
  /** Les étapes franchies, dans l'ordre du parcours. */
  etapesRepondues: EtapeQuestionnaire[];
}

export function vueQuestionnaire(
  profil: InvestorComplianceProfile,
): VueQuestionnaire {
  return {
    questionnaire: profil.questionnairePublie,
    etapeSuivante: profil.etapeSuivanteDuQuestionnaire(),
    etapesRepondues: profil.etapesReponduesDuQuestionnaire(),
  };
}
