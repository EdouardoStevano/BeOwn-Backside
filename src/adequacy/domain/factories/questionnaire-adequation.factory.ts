import {
  AdequacyAssessment,
  ReponsesQuestionnaire,
} from 'src/adequacy/domain/entities/adequacy-assessment';
import { AvancementQuestionnaire } from 'src/adequacy/domain/value-objects/avancement-questionnaire.vo';
import { CapaciteDePerte } from 'src/adequacy/domain/value-objects/capacite-de-perte.vo';
import { PreQualificationPsfp } from 'src/adequacy/domain/value-objects/pre-qualification-psfp.vo';
import { QualificationPsfp } from 'src/adequacy/domain/value-objects/qualification-psfp.vo';
import { ResultatAdequation } from 'src/adequacy/domain/value-objects/resultat-adequation.vo';

/** Ce qu'il faut pour un premier passage : les réponses, et rien d'autre. */
export type RepondreQuestionnaireProps = ReponsesQuestionnaire;

/**
 * Premier passage du questionnaire d'adéquation.
 *
 * Même rôle que `ProfilPPFactory` : répartir un formulaire plat entre ses
 * étapes, et laisser le classement se déduire des réponses. Rien ici n'est décidé par l'appelant :
 * il n'y a pas de props « catégorie » ni « montant conseillé », et c'est le
 * point (§4 — Open/Closed sur la règle réglementaire).
 *
 * Les passages suivants ne repassent pas par ici : le questionnaire existant
 * est relu, puis `AdequacyAssessment.repondre` lui donne les nouvelles
 * réponses. Les deux chemins construisent les mêmes blocs et appliquent le même
 * classement, la fabrique ajoutant seulement ce qui n'a de sens qu'une fois —
 * la clé.
 *
 * Une classe à méthodes statiques, sans `@Injectable` : elle ne dépend de rien,
 * et un décorateur NestJS introduirait dans le domaine une dépendance de
 * framework que rien ne justifie (§12.1).
 */
export class QuestionnaireAdequationFactory {
  static repondre(
    props: RepondreQuestionnaireProps,
    maintenant: Date = new Date(),
  ): AdequacyAssessment {
    const preQualification = PreQualificationPsfp.declarer(props);
    const qualification = QualificationPsfp.declarer(props);
    const capacite = CapaciteDePerte.declarer(props);

    return new AdequacyAssessment({
      entete: ENTETE_ATTRIBUEE_PAR_LA_PERSISTANCE,
      preQualification,
      qualification,
      capacite,
      // Les trois étapes arrivent ensemble : elles sont datées ensemble.
      avancement: AvancementQuestionnaire.toutRepondu(maintenant),
      resultat: ResultatAdequation.calculer(
        preQualification,
        qualification,
        capacite,
      ),
    });
  }

  /**
   * Questionnaire ouvert mais vierge — aucune étape répondue.
   *
   * C'est par ici que passe le parcours en trois temps : le titulaire répond à
   * la première étape sans avoir vu les deux autres, il faut donc un
   * questionnaire à qui la donner. Les blocs valent leur défaut — toutes les
   * réponses à « non », aucun montant — et le classement qui en découle est
   * `NON_AVERTI` sans plafond, c'est-à-dire le régime le plus protecteur : un
   * questionnaire commencé et abandonné ne délivre de rien.
   *
   * Distinct de {@link repondre}, qui reçoit un formulaire déjà rempli. Les
   * deux produisent le même agrégat ; seul l'avancement les sépare, et c'est
   * précisément ce qu'il sert à dire.
   */
  static commencer(): AdequacyAssessment {
    const preQualification = PreQualificationPsfp.declarer();
    const qualification = QualificationPsfp.declarer();
    const capacite = CapaciteDePerte.declarer();

    return new AdequacyAssessment({
      entete: ENTETE_ATTRIBUEE_PAR_LA_PERSISTANCE,
      preQualification,
      qualification,
      capacite,
      avancement: AvancementQuestionnaire.vierge(),
      resultat: ResultatAdequation.calculer(
        preQualification,
        qualification,
        capacite,
      ),
    });
  }
}

/**
 * Attribuée par la persistance — l'`id` est un uuid généré en base. Le
 * titulaire n'y figure pas : c'est la racine qui le connaît (§6).
 */
const ENTETE_ATTRIBUEE_PAR_LA_PERSISTANCE = {
  id: undefined as unknown as string,
  createdAt: undefined as unknown as Date,
  updatedAt: undefined as unknown as Date,
};
