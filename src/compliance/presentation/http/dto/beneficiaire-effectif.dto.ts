import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ModeDeDetention } from 'src/compliance/domain/enums/mode-de-detention.enum';

export class CreateBeneficiaireEffectifDto {
  @ApiProperty({
    description:
      'UUID de la société à laquelle rattacher ce bénéficiaire. Obligatoire : ' +
      'un compte peut en déclarer plusieurs, et rien ne permet de deviner ' +
      'laquelle est visée.',
  })
  @IsUUID()
  pmId: string;

  @ApiProperty() @IsString() @IsNotEmpty() prenom: string;
  @ApiProperty() @IsString() @IsNotEmpty() nom: string;

  @ApiPropertyOptional({ example: '1985-06-15' })
  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @ApiPropertyOptional({
    example: 'FR',
    description: 'Code ISO 3166-1 alpha-2',
  })
  @IsOptional()
  @IsString()
  nationalite?: string;

  /**
   * Les bornes ne sont plus déclarées ici.
   *
   * Elles l'étaient — `@Min(25) @Max(100)` — et n'étaient donc opposables qu'à
   * cette route. Le seuil des 25 % est une règle du cahier des charges et de la
   * directive LCB-FT, pas une contrainte de formulaire : il vit dans
   * `PourcentageDetention`, où il vaut pour tout point d'entrée. Ce qui reste
   * ici est ce que le transport doit garantir — que c'est bien un nombre.
   */
  @ApiProperty({
    example: 33.33,
    description:
      'Part du capital détenue, en pourcentage. Au moins 25 % : en deçà, la ' +
      "personne n'est pas un bénéficiaire effectif au sens du règlement.",
  })
  @IsNumber()
  pourcentageDetention: number;

  @ApiPropertyOptional({
    enum: ModeDeDetention,
    default: ModeDeDetention.DIRECTE,
    description:
      'Détention directe (titres en nom propre) ou indirecte (via une ' +
      'holding). Seules les directes se partagent le capital : leur somme ne ' +
      'peut pas dépasser 100 %.',
  })
  @IsOptional()
  @IsEnum(ModeDeDetention)
  modeDetention?: ModeDeDetention;

  // `pieceIdentiteDocId` a disparu du formulaire. Rien ne le lisait, et rien ne
  // vérifiait qu'il désignait un document existant ni qu'il appartenait au bon
  // dossier. La pièce d'identité d'un bénéficiaire se dépose désormais par
  // `POST /profiles/pm/:societeId/pieces` avec le type
  // `piece_identite_beneficiaire` et l'identifiant de la personne.
}
