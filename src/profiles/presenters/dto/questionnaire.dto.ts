import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class SaveQuestionnaireDto {
  // Étape 1
  @ApiProperty() @IsBoolean() workInFinancialSector: boolean;
  @ApiProperty() @IsBoolean() moreThan10TransactionsPerQuarter: boolean;
  @ApiProperty() @IsBoolean() portfolioOver500k: boolean;

  // Étape 2
  @ApiProperty() @IsBoolean() previousUnlistedInvestments: boolean;
  @ApiProperty() @IsBoolean() investmentExperienceOver5Years: boolean;
  @ApiProperty() @IsBoolean() financialPatrimonyOver500k: boolean;
  @ApiProperty() @IsBoolean() understandsTotalLossRisk: boolean;
  @ApiProperty() @IsBoolean() financialSectorBackground: boolean;

  // Étape 3 (optionnels si professionnel/averti)
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) patrimoineNet?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) revenuAnnuel?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) budgetAnnuelInvestissement?: number;
  @ApiProperty() @IsBoolean() acceptsSimulatedLoss: boolean;
}
