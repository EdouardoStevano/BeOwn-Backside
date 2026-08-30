import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { ProfilInvestisseur } from 'src/adequacy/domain/value-objects/profil-investisseur.vo';
import { EvaluationDAdequation } from 'src/adequacy/domain/aggregates/evaluation-d-adequation';
import type { EvaluationDAdequationRepository } from 'src/adequacy/domain/repositories/evaluation-d-adequation.repository';
import { ClassementPsfp } from 'src/adequacy/domain/value-objects/classement-psfp.vo';
import { SuiviInvestisseur } from 'src/adequacy/domain/value-objects/suivi-investisseur.vo';
import { EvaluationAdequationEntity } from '../persistence/entities/evaluation-adequation.entity';
import { QuestionnaireAdequationEntity } from '../persistence/entities/questionnaire-adequation.entity';
import { QuestionnaireAdequationOrmMapper } from '../persistence/mappers/questionnaire-adequation.orm-mapper';

/** Le driver rend les colonnes `decimal` en chaîne. */
function nombreOuNull(valeur: number | string | null): number | null {
  return valeur === null ? null : Number(valeur);
}

/**
 * Compose l'évaluation d'adéquation depuis les deux tables qui la portent.
 *
 * **C'est le seul chemin d'écriture de l'évaluation**, et le seul endroit qui
 * sache que `questionnaire_adequation` se rattache à `evaluation_adequation`.
 * La colonne de rattachement s'appelle encore `profileId` : elle porte les
 * mêmes valeurs qu'avant la scission, l'identifiant ayant été repris tel quel
 * d'une table à l'autre (voir `EvaluationDAdequationATable1785100000000`). La
 * renommer serait une migration de plus pour un gain cosmétique.
 *
 * Il n'écrit que **ses** colonnes : le dossier de vérification et le verdict
 * KYB ont leur table. C'est ce qui permet à un questionnaire enregistré de ne
 * pas remettre un KYB à la valeur lue au chargement.
 */
@Injectable()
export class EvaluationDAdequationTypeOrmRepository implements EvaluationDAdequationRepository {
  constructor(
    @InjectRepository(QuestionnaireAdequationEntity)
    private readonly questionnaires: Repository<QuestionnaireAdequationEntity>,
    @InjectRepository(EvaluationAdequationEntity)
    private readonly evaluations: Repository<EvaluationAdequationEntity>,
  ) {}

  parTitulaire(investorId: number): Promise<EvaluationDAdequation> {
    return this.charger(
      investorId,
      ProfilInvestisseur.personnePhysique(),
      IsNull(),
    );
  }

  parSociete(
    investorId: number,
    societeId: string,
  ): Promise<EvaluationDAdequation> {
    return this.charger(
      investorId,
      ProfilInvestisseur.societe(societeId),
      societeId,
    );
  }

  /**
   * `IsNull()` plutôt que `null` dans le critère : TypeORM traduit le premier
   * en `IS NULL` et ignore purement le second, ce qui rendrait ici l'évaluation
   * d'une société au titulaire qui demande la sienne.
   */
  private async charger(
    investorId: number,
    souscripteur: ProfilInvestisseur,
    critereSociete: FindOptionsWhere<EvaluationAdequationEntity>['souscripteurSocieteId'],
  ): Promise<EvaluationDAdequation> {
    const racine = await this.evaluations.findOne({
      where: { userId: investorId, souscripteurSocieteId: critereSociete },
    });

    // Qui n'a pas répondu **est** non averti : c'est un classement, pas une
    // absence d'évaluation.
    if (!racine) {
      return EvaluationDAdequation.vierge(investorId, souscripteur);
    }

    const questionnaire = await this.questionnaires.findOne({
      where: { profileId: racine.id },
    });

    return new EvaluationDAdequation({
      id: racine.id,
      investorId,
      souscripteur,
      adequacy: questionnaire
        ? QuestionnaireAdequationOrmMapper.questionnaireToDomain(questionnaire)
        : null,
      classement: ClassementPsfp.restore({
        categoriePsfp: racine.categoriePsfp,
        patrimoineDeclare: nombreOuNull(racine.patrimoineDeclare),
        montantMaxConseille: nombreOuNull(racine.montantMaxConseille),
      }),
      suivi: SuiviInvestisseur.restore(racine),
    });
  }

  async save(
    evaluation: EvaluationDAdequation,
  ): Promise<EvaluationDAdequation> {
    const { adequacy, classement, suivi } = evaluation.pieces;

    // La racine d'abord : sa pièce a besoin de son identité.
    const racine = await this.evaluations.save({
      ...(evaluation.id ? { id: evaluation.id } : {}),
      userId: evaluation.investorId,
      souscripteurSocieteId: evaluation.souscripteur.societeId,
      ...classement,
      ...suivi,
    });

    if (adequacy) {
      await this.questionnaires.save(
        QuestionnaireAdequationOrmMapper.questionnaireToEntity(
          adequacy,
          racine.id,
        ),
      );
    }

    const souscripteur = evaluation.souscripteur;
    return souscripteur.estSociete()
      ? this.parSociete(evaluation.investorId, souscripteur.societeId as string)
      : this.parTitulaire(evaluation.investorId);
  }
}
