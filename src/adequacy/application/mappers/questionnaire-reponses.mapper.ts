import { ReponsesQuestionnaire } from 'src/adequacy/domain/entities/adequacy-assessment';
import { ChampsCapaciteDePerte } from 'src/adequacy/domain/value-objects/capacite-de-perte.vo';
import { ChampsPreQualification } from 'src/adequacy/domain/value-objects/pre-qualification-psfp.vo';
import { ChampsQualification } from 'src/adequacy/domain/value-objects/qualification-psfp.vo';
import {
  CapaciteDePerteDto,
  PreQualificationDto,
  QualificationDto,
  SaveQuestionnaireDto,
} from 'src/adequacy/presentation/http/dto/questionnaire.dto';

/**
 * Traduit les DTO HTTP du questionnaire en réponses du domaine.
 *
 * Jumeau de `champsDeclaresDepuisDto`, et pour la même raison : le use case
 * faisait `Object.assign(entity, dto)`, ce qui recopiait dans la ligne **toute**
 * clé présente dans le corps de la requête. Une clé `resultCategorie` glissée
 * dans le JSON atterrissait donc telle quelle en base, par-dessus le classement
 * calculé — c'est-à-dire qu'on pouvait se déclarer « professionnel » et se
 * délivrer soi-même du plafond d'investissement et du délai de rétractation.
 *
 * Chaque liste est écrite en toutes lettres plutôt que déduite par un `rest` :
 * ajouter un champ à un DTO ne doit pas suffire à le faire entrer dans le
 * domaine, la décision doit se prendre ici.
 *
 * Une fonction par étape, et la forme complète **composée** des trois. C'est ce
 * qui garantit qu'une question posée par une route par étape et par la route
 * historique traverse la même traduction : il n'y a qu'une liste par étape,
 * pas deux qui divergeraient.
 */

/** Étape 1 — pré-qualification. */
export function preQualificationDepuisDto(
  dto: PreQualificationDto,
): ChampsPreQualification {
  return {
    workInFinancialSector: dto.workInFinancialSector,
    moreThan10TransactionsPerQuarter: dto.moreThan10TransactionsPerQuarter,
    portfolioOver500k: dto.portfolioOver500k,
  };
}

/** Étape 2 — qualification. */
export function qualificationDepuisDto(
  dto: QualificationDto,
): ChampsQualification {
  return {
    previousUnlistedInvestments: dto.previousUnlistedInvestments,
    investmentExperienceOver5Years: dto.investmentExperienceOver5Years,
    financialPatrimonyOver500k: dto.financialPatrimonyOver500k,
    understandsTotalLossRisk: dto.understandsTotalLossRisk,
    financialSectorBackground: dto.financialSectorBackground,
  };
}

/** Étape 3 — capacité à subir des pertes. */
export function capaciteDePerteDepuisDto(
  dto: CapaciteDePerteDto,
): ChampsCapaciteDePerte {
  return {
    patrimoineNet: dto.patrimoineNet,
    revenuAnnuel: dto.revenuAnnuel,
    budgetAnnuelInvestissement: dto.budgetAnnuelInvestissement,
    acceptsSimulatedLoss: dto.acceptsSimulatedLoss,
  };
}

/** Le formulaire entier — les trois étapes d'un seul geste (route historique). */
export function reponsesDepuisDto(
  dto: SaveQuestionnaireDto,
): ReponsesQuestionnaire {
  return {
    ...preQualificationDepuisDto(dto),
    ...qualificationDepuisDto(dto),
    ...capaciteDePerteDepuisDto(dto),
  };
}
