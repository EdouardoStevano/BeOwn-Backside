import {
  QuestionnaireAdequation,
  QuestionnaireAdequationSnapshot,
  QuestionnaireAdequationSnapshotBrut,
} from 'src/iam/domain/aggregates/questionnaire-adequation';
import { CapaciteDePerte } from 'src/iam/domain/value-objects/capacite-de-perte.vo';
import { PreQualificationPsfp } from 'src/iam/domain/value-objects/pre-qualification-psfp.vo';
import { QualificationPsfp } from 'src/iam/domain/value-objects/qualification-psfp.vo';
import { ResultatAdequation } from 'src/iam/domain/value-objects/resultat-adequation.vo';

/**
 * Traductions entre le questionnaire et sa représentation de persistance
 * (`QuestionnaireAdequationSnapshot`, faite de primitives et à plat).
 *
 * Même rôle et mêmes raisons que `ProfilPPMapper` : changer la forme de
 * stockage ou ajouter une projection ne doit pas rouvrir l'agrégat (§4 — SRP).
 */
export class QuestionnaireAdequationMapper {
  /**
   * Reconstitution depuis la persistance, **sans contrôle et sans reclassement**.
   *
   * Chaque bloc passe par son `restore` et non par son `declarer` : une ligne
   * écrite avant qu'une borne n'existe doit rester lisible, et le classement
   * gardé en base est la décision telle qu'elle a été prise — voir
   * `ResultatAdequation.restore`. La validation s'applique là où une réponse
   * **entre** : `QuestionnaireAdequationFactory.repondre` et
   * `QuestionnaireAdequation.repondre`.
   */
  static restore(
    snapshot: QuestionnaireAdequationSnapshotBrut,
  ): QuestionnaireAdequation {
    return new QuestionnaireAdequation({
      entete: {
        id: snapshot.id,
        utilisateurId: snapshot.utilisateurId,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
      preQualification: PreQualificationPsfp.restore(snapshot),
      qualification: QualificationPsfp.restore(snapshot),
      capacite: CapaciteDePerte.restore(snapshot),
      resultat: ResultatAdequation.restore(snapshot),
    });
  }

  /**
   * État complet, en primitives et à plat — destiné aux mappers de persistance
   * et à la sérialisation HTTP.
   *
   * Assemblé depuis le snapshot de chaque bloc : le découpage interne n'a donc
   * aucun effet sur le contrat de persistance ni sur le JSON renvoyé, et le
   * compilateur le garantit — `QuestionnaireAdequationSnapshot` est lui-même
   * composé des snapshots de blocs.
   */
  static toSnapshot(
    questionnaire: QuestionnaireAdequation,
  ): QuestionnaireAdequationSnapshot {
    return {
      id: questionnaire.id,
      utilisateurId: questionnaire.utilisateurId,
      createdAt: questionnaire.createdAt,
      updatedAt: questionnaire.updatedAt,
      ...questionnaire.preQualification.toSnapshot(),
      ...questionnaire.qualification.toSnapshot(),
      ...questionnaire.capacite.toSnapshot(),
      ...questionnaire.resultat.toSnapshot(),
    };
  }
}
