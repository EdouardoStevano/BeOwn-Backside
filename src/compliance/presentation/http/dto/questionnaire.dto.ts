import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Étape 1 — pré-qualification : deux critères sur trois font un professionnel,
 * qui n'a alors aucune étape suivante à passer.
 *
 * Les trois booléens sont **obligatoires** : ils sont comptés ensemble, et une
 * réponse omise serait comptée « non » sans que le titulaire l'ait dit.
 */
export class PreQualificationDto {
  @ApiProperty() @IsBoolean() workInFinancialSector: boolean;
  @ApiProperty() @IsBoolean() moreThan10TransactionsPerQuarter: boolean;
  @ApiProperty() @IsBoolean() portfolioOver500k: boolean;
}

/**
 * Étape 2 — qualification : quatre critères sur cinq font un investisseur
 * averti, qui n'a pas à simuler sa capacité de perte.
 */
export class QualificationDto {
  @ApiProperty() @IsBoolean() previousUnlistedInvestments: boolean;
  @ApiProperty() @IsBoolean() investmentExperienceOver5Years: boolean;
  @ApiProperty() @IsBoolean() financialPatrimonyOver500k: boolean;
  @ApiProperty() @IsBoolean() understandsTotalLossRisk: boolean;
  @ApiProperty() @IsBoolean() financialSectorBackground: boolean;
}

/**
 * Étape 3 — capacité à subir des pertes, dont sort le montant conseillé.
 *
 * Les montants restent facultatifs : le titulaire peut accepter la simulation
 * sans tout chiffrer, et l'absence de patrimoine déclaré donne le plancher
 * réglementaire plutôt qu'un plafond calculé. Ils sont bornés une seconde fois
 * dans `CapaciteDePerte`, pour valoir hors de cette route.
 */
export class CapaciteDePerteDto {
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) patrimoineNet?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) revenuAnnuel?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) budgetAnnuelInvestissement?: number;
  @ApiProperty() @IsBoolean() acceptsSimulatedLoss: boolean;
}

/**
 * Le formulaire entier, tel que la route historique le reçoit.
 *
 * **Composé** des trois étapes plutôt que réécrit à plat : chaque champ garde
 * une seule déclaration, ses décorateurs de validation et sa documentation
 * Swagger, et ajouter une question à une étape l'ajoute ici sans qu'on y pense.
 * `IntersectionType` conserve les métadonnées `class-validator` des classes
 * qu'il combine — le corps est donc validé exactement comme avant le découpage.
 *
 * @deprecated Préférer les trois routes par étape, qui suivent le parcours
 *   décrit par le cahier des charges et disent laquelle vient ensuite. Cette
 *   route reste servie : elle est le contrat du front actuel.
 */
export class SaveQuestionnaireDto extends IntersectionType(
  IntersectionType(PreQualificationDto, QualificationDto),
  CapaciteDePerteDto,
) {}
