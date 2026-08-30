import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class ValiderKybDto {
  @ApiPropertyOptional({
    example: '2027-08-28',
    description:
      'Échéance de la validité du dossier, au format `AAAA-MM-JJ`. Omise, la ' +
      'validation ne porte pas de terme. Elle est saisie et non calculée : la ' +
      "cadence de re-vérification d'une personne morale n'est arrêtée nulle " +
      'part, et la déduire ferait expirer des dossiers selon une règle que ' +
      "personne n'a écrite.",
  })
  @IsOptional()
  @IsDateString()
  valideJusquAu?: string;
}

export class RefuserKybDto {
  @ApiPropertyOptional({
    description:
      "Motif du rejet. Obligatoire : c'est ce que le titulaire lira, et la " +
      'seule chose qui lui dise pourquoi un dossier dont toutes les pièces ' +
      'sont acceptées a malgré tout été écarté.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  motif?: string;
}
