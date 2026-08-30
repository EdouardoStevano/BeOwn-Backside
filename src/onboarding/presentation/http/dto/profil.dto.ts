import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateProfilPPDto {
  @ApiPropertyOptional({ example: 'M.', description: 'Civilité (M. / Mme)' })
  @IsOptional()
  @IsString()
  civilite?: string;

  @ApiPropertyOptional({ example: '1985-06-15' })
  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  lieuNaissance?: string;

  @ApiPropertyOptional({
    example: 'CI',
    description: 'Code ISO 2 pays de nationalité',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  nationalite?: string;

  @ApiPropertyOptional({ example: '12 rue de la Paix' })
  @IsOptional()
  @IsString()
  adresseLigne1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adresseLigne2?: string;

  @ApiPropertyOptional({ example: '75001' })
  @IsOptional()
  @IsString()
  codePostal?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  ville?: string;

  @ApiPropertyOptional({ example: 'FR' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  pays?: string;

  @ApiPropertyOptional({ example: '+33612345678' })
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiPropertyOptional({ example: 'Ingénieur' })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional({ example: 'Technologie' })
  @IsOptional()
  @IsString()
  secteurActivite?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  pep?: boolean;

  @ApiPropertyOptional({ example: 'FR' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  residenceFiscale?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  nif?: string;

  // `patrimoineDeclare` et `montantMaxConseille` ne sont pas ici, et ne
  // reviendront pas.
  //
  // Ils n'ont jamais rien fait : `champsDeclaresDepuisDto` les écartait déjà,
  // et le domaine n'a pas où les mettre — le patrimoine appartient à l'étape 3
  // du questionnaire d'adéquation (`CapaciteDePerte`), et le montant conseillé
  // en est **déduit**, jamais déclaré (`ResultatAdequation`, dont le
  // constructeur est privé pour cette raison précise). Les accepter ici les
  // annonçait pourtant comme réglables dans Swagger, exemples à l'appui : une
  // invitation à croire qu'on peut se fixer son propre plafond PSFP — c'est-à-
  // dire à contourner la limite des 5 % du patrimoine sans répondre au
  // questionnaire.
  //
  // Ils restent **publiés** dans la réponse des routes du profil, où ils sont à
  // leur place : le front les lit, il ne les écrit pas (voir
  // `ClassementPublie`).
}

export class CreateProfilPMDto {
  @ApiProperty({ example: 'BeOwn SAS' })
  @IsNotEmpty()
  @IsString()
  raisonSociale: string;

  @ApiPropertyOptional({ example: 'SAS' })
  @IsOptional()
  @IsString()
  formeJuridique?: string;

  @ApiPropertyOptional({ example: '123456789' })
  @IsOptional()
  @IsString()
  siren?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  rcsVille?: string;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  capitalSocial?: number;

  @ApiPropertyOptional({ example: '12 rue de la Paix, 75001 Paris' })
  @IsOptional()
  @IsString()
  siegeAdresse?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secteurActivite?: string;
}

/**
 * Mise à jour partielle du profil moral.
 *
 * Une **classe** dérivée par `PartialType`, et non un simple
 * `Partial<CreateProfilPMDto>` : le `ValidationPipe` de Nest se fie au type
 * réfléchi du paramètre, et un type utilitaire TypeScript s'efface à la
 * compilation — le pipe ne verrait qu'`Object` et ne validerait rien du tout.
 * `PartialType` conserve les décorateurs en les rendant tous optionnels, donc
 * un SIREN mal formé est refusé ici comme il l'est à la création.
 *
 * Le domaine reste le filet : `ProfilPM.mettreAJour` éprouve à nouveau chaque
 * champ, quel que soit le point d'entrée. Ce DTO est le portier — c'est lui qui
 * produit un 400 lisible et documente Swagger.
 */
export class UpdateProfilPMDto extends PartialType(CreateProfilPMDto) {}
