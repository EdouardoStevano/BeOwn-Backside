import { ReponsesQuestionnaire } from 'src/compliance/domain/aggregates/questionnaire-adequation';
import { SaveQuestionnaireDto } from 'src/compliance/presentation/http/dto/questionnaire.dto';

/**
 * Traduit le DTO HTTP en réponses du domaine.
 *
 * Jumeau de `champsDeclaresDepuisDto`, et pour la même raison : le use case
 * faisait `Object.assign(entity, dto)`, ce qui recopiait dans la ligne **toute**
 * clé présente dans le corps de la requête. Une clé `resultCategorie` glissée
 * dans le JSON atterrissait donc telle quelle en base, par-dessus le classement
 * calculé — c'est-à-dire qu'on pouvait se déclarer « professionnel » et se
 * délivrer soi-même du plafond d'investissement et du délai de rétractation.
 *
 * La liste est écrite en toutes lettres plutôt que déduite par un `rest` :
 * ajouter un champ au DTO ne doit pas suffire à le faire entrer dans le
 * domaine, la décision doit se prendre ici.
 */
export function reponsesDepuisDto(
  dto: SaveQuestionnaireDto,
): ReponsesQuestionnaire {
  return {
    // Étape 1 — pré-qualification
    workInFinancialSector: dto.workInFinancialSector,
    moreThan10TransactionsPerQuarter: dto.moreThan10TransactionsPerQuarter,
    portfolioOver500k: dto.portfolioOver500k,
    // Étape 2 — qualification
    previousUnlistedInvestments: dto.previousUnlistedInvestments,
    investmentExperienceOver5Years: dto.investmentExperienceOver5Years,
    financialPatrimonyOver500k: dto.financialPatrimonyOver500k,
    understandsTotalLossRisk: dto.understandsTotalLossRisk,
    financialSectorBackground: dto.financialSectorBackground,
    // Étape 3 — capacité de perte
    patrimoineNet: dto.patrimoineNet,
    revenuAnnuel: dto.revenuAnnuel,
    budgetAnnuelInvestissement: dto.budgetAnnuelInvestissement,
    acceptsSimulatedLoss: dto.acceptsSimulatedLoss,
  };
}
