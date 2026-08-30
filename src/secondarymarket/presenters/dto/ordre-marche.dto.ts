import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OrdreMarcheSens,
  OrdreMarcheStatus,
} from 'src/secondarymarket/domains/ordre-marche';

export class CreateOrdreMarcheDto {
  @ApiProperty({ example: 'uuid-investissement' })
  @IsUUID()
  investissementId: string;

  @ApiProperty({ enum: OrdreMarcheSens })
  @IsEnum(OrdreMarcheSens)
  sens: OrdreMarcheSens;

  @ApiProperty({
    example: 50,
    description: 'Nombre de fractions à vendre/acheter',
  })
  @IsNumber()
  @IsPositive()
  nbFractions: number;

  @ApiProperty({ example: 100, description: 'Prix unitaire par fraction' })
  @IsNumber()
  @IsPositive()
  prixUnitaire: number;

  @ApiProperty({
    example: 5000,
    description: 'Montant total = nbFractions × prixUnitaire',
  })
  @IsNumber()
  @IsPositive()
  montant: number;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  valideJusquAu?: string;
}

/**
 * Corps de `POST orders/:id/interet`.
 *
 * Une marque d'intérêt ne forme aucun contrat : elle sollicite le vendeur, qui
 * seul peut l'accepter. Le champ reste optionnel — omis, l'intérêt porte sur
 * une fraction.
 */
export class ExprimerInteretDto {
  @ApiPropertyOptional({
    example: 3,
    description:
      "Nombre de fractions sur lesquelles porte l'intérêt. Omis = 1 fraction.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  nbFractions?: number;
}

/**
 * Devis de frais servi AVANT tout engagement, côté acheteur comme côté
 * vendeur. Les montants viennent de la grille administrable
 * (`PlatformFeesService`) : aucune interface ne doit recalculer un taux.
 */
export class DevisFraisCessionDto {
  @ApiProperty({ example: 5000, description: 'Montant de la cession, avant frais' })
  montantBrut: number;

  @ApiProperty({
    example: 500,
    description: 'Plus-value du vendeur servant d\'assiette (0 si moins-value)',
  })
  plusValueVendeur: number;

  @ApiProperty({ example: 50, description: 'Frais de transaction' })
  fraisTransaction: number;

  @ApiProperty({ example: 75, description: 'Frais sur plus-value' })
  fraisPlusValue: number;

  @ApiProperty({ example: 125 })
  totalFrais: number;

  @ApiProperty({ example: 4875, description: 'Net perçu par le vendeur' })
  netVendeur: number;

  @ApiProperty({
    example: 'vendeur',
    description: 'Partie qui supporte les frais du marché secondaire',
  })
  aLaChargeDe: 'vendeur';

  @ApiProperty({ example: 1, description: 'Taux de frais de transaction, en %' })
  tauxTransactionPct: number;

  @ApiProperty({ example: 15, description: 'Taux de frais sur plus-value, en %' })
  tauxPlusValuePct: number;
}

/** Projet sous-jacent, réduit à ce qu'un écran d'annonce doit afficher. */
export class ProjetAnnonceDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() titre: string;
  @ApiPropertyOptional({ nullable: true }) ville: string | null;
  @ApiProperty({ description: 'Statut du projet sous-jacent' }) statut: string;
}

/**
 * Identité de l'acheteur montrée au vendeur.
 *
 * Volontairement réduite au strict nécessaire pour donner un accord éclairé :
 * ni email, ni identifiant technique, ni nom complet. La plateforme a déjà
 * vérifié l'identité de l'acheteur ; le vendeur n'a pas à la connaître.
 */
export class AcheteurMinimalDto {
  @ApiProperty({ example: 'Camille' }) prenom: string;
  @ApiProperty({ example: 'D.', description: 'Initiale du nom, suivie d\'un point' })
  initialeNom: string;
}

/** Une marque d'intérêt reçue sur une annonce du demandeur. */
export class InteretRecuDto {
  @ApiProperty({ description: "UUID de l'annonce concernée" })
  ordreId: string;

  @ApiProperty({
    enum: OrdreMarcheStatus,
    description: "Toujours `interet_exprime` : l'annonce attend la réponse du vendeur",
  })
  statut: OrdreMarcheStatus;

  @ApiProperty({ type: ProjetAnnonceDto })
  projet: ProjetAnnonceDto;

  @ApiProperty({ example: 3, description: "Fractions sur lesquelles porte l'intérêt" })
  nbFractions: number;

  @ApiProperty({ example: 10, description: "Fractions portées par l'annonce" })
  nbFractionsAnnonce: number;

  @ApiProperty({ example: 100 })
  prixUnitaire: number;

  @ApiProperty({ example: 300, description: 'nbFractions × prixUnitaire' })
  montantIndicatif: number;

  @ApiProperty({ description: "Horodatage ISO de l'expression d'intérêt" })
  exprimeLe: string;

  @ApiProperty({ type: AcheteurMinimalDto })
  acheteur: AcheteurMinimalDto;

  @ApiProperty({
    type: DevisFraisCessionDto,
    description: 'Frais que supporterait le vendeur si la cession se formait',
  })
  devis: DevisFraisCessionDto;
}
