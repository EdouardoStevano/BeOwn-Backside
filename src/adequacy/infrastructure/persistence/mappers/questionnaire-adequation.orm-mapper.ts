import { QuestionnaireAdequationMapper as QuestionnaireAdequationDomainMapper } from 'src/adequacy/domain/mappers/questionnaire-adequation.mapper';
import { AdequacyAssessment } from 'src/adequacy/domain/entities/adequacy-assessment';
import { QuestionnaireAdequationEntity } from '../entities/questionnaire-adequation.entity';

/**
 * Moitié ORM du chemin entre le questionnaire d'adéquation et sa table.
 *
 * Ces deux méthodes vivaient dans le `ProfilMapper` de l'entrée en relation, du
 * temps où profil et questionnaire partageaient un agrégat. La scission des
 * deux contextes les rend à celui qui écrit la table (§3) : l'entrée en
 * relation n'a plus à connaître ni les colonnes du questionnaire, ni son
 * classement.
 *
 * Comme son voisin de l'onboarding, il ne fait que la traduction vers l'entité
 * et délègue l'autre moitié — snapshot ↔ agrégat — au mapper de domaine.
 */
export class QuestionnaireAdequationOrmMapper {
  static questionnaireToDomain(
    entity: QuestionnaireAdequationEntity,
  ): AdequacyAssessment {
    return QuestionnaireAdequationDomainMapper.restore({
      id: entity.id,
      workInFinancialSector: entity.workInFinancialSector,
      moreThan10TransactionsPerQuarter: entity.moreThan10TransactionsPerQuarter,
      portfolioOver500k: entity.portfolioOver500k,
      previousUnlistedInvestments: entity.previousUnlistedInvestments,
      investmentExperienceOver5Years: entity.investmentExperienceOver5Years,
      financialPatrimonyOver500k: entity.financialPatrimonyOver500k,
      understandsTotalLossRisk: entity.understandsTotalLossRisk,
      financialSectorBackground: entity.financialSectorBackground,
      patrimoineNet: entity.patrimoineNet,
      revenuAnnuel: entity.revenuAnnuel,
      budgetAnnuelInvestissement: entity.budgetAnnuelInvestissement,
      acceptsSimulatedLoss: entity.acceptsSimulatedLoss,
      preQualificationRepondueLe: entity.preQualificationRepondueLe,
      qualificationRepondueLe: entity.qualificationRepondueLe,
      capaciteRepondueLe: entity.capaciteRepondueLe,
      resultCategorie: entity.resultCategorie,
      resultMontantMaxConseille: entity.resultMontantMaxConseille,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  /**
   * Sens écriture : tout l'état du questionnaire, classement compris.
   *
   * Contrairement au profil, l'agrégat est ici **propriétaire de toutes ses
   * colonnes** — y compris `resultCategorie` et `resultMontantMaxConseille`,
   * que personne d'autre n'écrit : ils sont déduits des réponses par
   * `ResultatAdequation.calculer`. C'est le questionnaire qui les reporte
   * ensuite sur le profil, via `enregistrerClassementPsfp`.
   */
  /** @see KycOrmMapper.toEntity — `profileId` vient du repository. */
  static questionnaireToEntity(
    domain: AdequacyAssessment,
    profileId: string,
  ): QuestionnaireAdequationEntity {
    const snapshot = QuestionnaireAdequationDomainMapper.toSnapshot(domain);
    const entity = new QuestionnaireAdequationEntity();
    // Absent d'un premier passage : l'uuid est généré en base.
    if (snapshot.id) entity.id = snapshot.id;
    entity.profileId = profileId;
    entity.workInFinancialSector = snapshot.workInFinancialSector;
    entity.moreThan10TransactionsPerQuarter =
      snapshot.moreThan10TransactionsPerQuarter;
    entity.portfolioOver500k = snapshot.portfolioOver500k;
    entity.previousUnlistedInvestments = snapshot.previousUnlistedInvestments;
    entity.investmentExperienceOver5Years =
      snapshot.investmentExperienceOver5Years;
    entity.financialPatrimonyOver500k = snapshot.financialPatrimonyOver500k;
    entity.understandsTotalLossRisk = snapshot.understandsTotalLossRisk;
    entity.financialSectorBackground = snapshot.financialSectorBackground;
    entity.patrimoineNet = snapshot.patrimoineNet;
    entity.revenuAnnuel = snapshot.revenuAnnuel;
    entity.budgetAnnuelInvestissement = snapshot.budgetAnnuelInvestissement;
    entity.acceptsSimulatedLoss = snapshot.acceptsSimulatedLoss;
    entity.preQualificationRepondueLe = snapshot.preQualificationRepondueLe;
    entity.qualificationRepondueLe = snapshot.qualificationRepondueLe;
    entity.capaciteRepondueLe = snapshot.capaciteRepondueLe;
    entity.resultCategorie = snapshot.resultCategorie;
    entity.resultMontantMaxConseille = snapshot.resultMontantMaxConseille;
    return entity;
  }
}
