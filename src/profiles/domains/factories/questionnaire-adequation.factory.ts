import {
  QuestionnaireAdequation,
  ReponsesQuestionnaire,
} from 'src/profiles/domains/questionnaire-adequation';
import { CapaciteDePerte } from 'src/profiles/domains/value-objects/capacite-de-perte.vo';
import { eprouverUtilisateurId } from 'src/profiles/domains/value-objects/identifiant-utilisateur';
import { PreQualificationPsfp } from 'src/profiles/domains/value-objects/pre-qualification-psfp.vo';
import { QualificationPsfp } from 'src/profiles/domains/value-objects/qualification-psfp.vo';
import { ResultatAdequation } from 'src/profiles/domains/value-objects/resultat-adequation.vo';

/** Ce qu'il faut pour un premier passage : le compte, et les réponses. */
export interface RepondreQuestionnaireProps extends ReponsesQuestionnaire {
  utilisateurId: number;
}

/**
 * Premier passage du questionnaire d'adéquation.
 *
 * Même rôle que `ProfilPPFactory` : répartir un formulaire plat entre ses
 * étapes, éprouver la clé — que nul bloc ne peut éprouver seul — et laisser le
 * classement se déduire des réponses. Rien ici n'est décidé par l'appelant :
 * il n'y a pas de props « catégorie » ni « montant conseillé », et c'est le
 * point (§4 — Open/Closed sur la règle réglementaire).
 *
 * Les passages suivants ne repassent pas par ici : le questionnaire existant
 * est relu, puis `QuestionnaireAdequation.repondre` lui donne les nouvelles
 * réponses. Les deux chemins construisent les mêmes blocs et appliquent le même
 * classement, la fabrique ajoutant seulement ce qui n'a de sens qu'une fois —
 * la clé.
 *
 * Une classe à méthodes statiques, sans `@Injectable` : elle ne dépend de rien,
 * et un décorateur NestJS introduirait dans le domaine une dépendance de
 * framework que rien ne justifie (§12.1).
 */
export class QuestionnaireAdequationFactory {
  static repondre(props: RepondreQuestionnaireProps): QuestionnaireAdequation {
    const preQualification = PreQualificationPsfp.declarer(props);
    const qualification = QualificationPsfp.declarer(props);
    const capacite = CapaciteDePerte.declarer(props);

    return new QuestionnaireAdequation({
      entete: {
        utilisateurId: eprouverUtilisateurId(props.utilisateurId),
        // Attribués par la persistance — l'`id` est un uuid généré en base.
        id: undefined as unknown as string,
        createdAt: undefined as unknown as Date,
        updatedAt: undefined as unknown as Date,
      },
      preQualification,
      qualification,
      capacite,
      resultat: ResultatAdequation.calculer(
        preQualification,
        qualification,
        capacite,
      ),
    });
  }
}
