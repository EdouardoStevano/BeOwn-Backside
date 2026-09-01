import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsPositive, IsString, Max } from 'class-validator';

/**
 * Versement au porteur EXÉCUTÉ par Stripe Connect.
 *
 * Tout est optionnel, et c'est délibéré : le cas courant est « verser au
 * porteur ce que son projet lui doit », c'est-à-dire le solde du portefeuille
 * du projet — un montant que le serveur connaît mieux que l'opérateur. Le
 * champ `montant` n'existe que pour les versements PARTIELS (échelonnement,
 * retenue provisoire).
 */
export class VerserPorteurStripeDto {
  @ApiPropertyOptional({
    example: 120_000,
    description:
      'Montant à verser en EUR. Absent = tout le solde du portefeuille du projet.',
  })
  @IsOptional()
  @IsPositive({ message: 'Le montant du versement doit être strictement positif.' })
  @Max(10_000_000, { message: 'Le montant du versement dépasse le plafond autorisé.' })
  montant?: number;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-...',
    description:
      "Clé d'idempotence du back-office. Une resoumission de la même demande " +
      'renvoie le versement déjà enregistré au lieu de payer une seconde fois.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idempotencyKey?: string;
}
