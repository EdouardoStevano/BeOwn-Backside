import {
  EtapeQuestionnaire,
  LIBELLE_ETAPE,
} from 'src/compliance/domain/enums/etape-questionnaire.enum';
import { ComplianceError, ComplianceErrorKind } from './compliance.error';

/**
 * Cette étape du questionnaire n'est pas ouverte au titulaire.
 *
 * Deux situations, et le message les distingue parce qu'elles n'appellent pas
 * la même conduite côté front :
 *
 * - **une étape amont manque** — on saute la qualification sans avoir répondu à
 *   la pré-qualification. Le classement en dépend : la qualification ne se lit
 *   que pour qui n'est pas déjà professionnel, et l'accepter avant produirait
 *   une catégorie fondée sur une étape que personne n'a passée ;
 * - **le classement acquis la rend sans objet** — un professionnel n'a pas
 *   d'étape suivante, et un averti n'a pas de capacité de perte à simuler. Le
 *   cahier des charges le dit des deux côtés : le professionnel « n'a pas
 *   besoin de compléter les étapes suivantes », et « seuls les investisseurs
 *   non-avertis doivent compléter l'étape suivante ».
 *
 * Repasser une étape **déjà répondue** n'est jamais refusé : le cahier des
 * charges autorise explicitement l'investisseur à « re-compléter cette étape
 * ainsi que toutes les autres à n'importe quel moment ».
 *
 * `CONFLICT` et non `INVALID_INPUT` : les réponses envoyées ne sont pas
 * fautives, c'est l'état du questionnaire qui rend l'étape inatteignable.
 */
export class EtapeQuestionnaireFermeeError extends ComplianceError {
  readonly kind = ComplianceErrorKind.CONFLICT;

  constructor(
    readonly demandee: EtapeQuestionnaire,
    readonly attendue: EtapeQuestionnaire | null,
  ) {
    super(
      attendue === null
        ? `L'étape « ${LIBELLE_ETAPE[demandee]} » ne vous concerne pas : votre classement clôt le questionnaire.`
        : `L'étape « ${LIBELLE_ETAPE[demandee]} » n'est pas ouverte : répondez d'abord à « ${LIBELLE_ETAPE[attendue]} ».`,
      {
        code: 'ETAPE_QUESTIONNAIRE_FERMEE',
        details: { demandee, attendue },
      },
    );
  }
}
