import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreatePaymentIntentDto {
  @ApiProperty({ example: 500, description: 'Montant en EUR' })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'EUR', description: 'Code devise ISO 4217' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ example: 'souscription', description: 'Type operation' })
  @IsOptional()
  @IsString()
  operationType?: string;

  @ApiPropertyOptional({ example: 'uuid-projet', description: 'ID du projet concerné' })
  @IsOptional()
  @IsString()
  projetId?: string;
}

export class ConfirmDepotDto {
  @ApiProperty({ example: 'pi_xxx', description: 'ID du PaymentIntent Stripe' })
  @IsString()
  @IsNotEmpty()
  paymentIntentId: string;
}

export class CreateRetraitDto {
  @ApiProperty({ example: 500, description: 'Montant à retirer (EUR)' })
  @IsPositive()
  @Min(10, { message: 'Le montant minimum de retrait est de 10 €.' })
  amount: number;

  @ApiProperty({ example: 'EUR', description: "Code devise ISO 4217 (seul l'EUR est accepté)" })
  @IsString()
  @IsIn(['EUR'], { message: 'Seule la devise EUR est acceptée.' })
  currency: string;

  @ApiPropertyOptional({
    example: 'wallet-uuid',
    description:
      "ID du wallet source. Optionnel : si absent, le wallet INVESTISSEUR de l'utilisateur authentifié est utilisé (parcours Stripe Connect, le front n'envoie que le montant).",
  })
  @IsOptional()
  @IsString()
  walletId?: string;

  @ApiPropertyOptional({
    example: 'SN0800100000015000000160',
    description:
      "IBAN/numéro de compte destinataire — requis UNIQUEMENT pour le retrait manuel legacy (secours). Ignoré quand le retrait passe par Stripe Connect (les coordonnées bancaires sont détenues par Stripe via l'onboarding du compte connecté).",
  })
  @IsOptional()
  @IsString()
  ibanDestination?: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-...',
    description:
      "Clé d'idempotence fournie par le client. Une même clé garantit qu'un retrait n'est traité qu'une seule fois (protection contre la double-soumission).",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idempotencyKey?: string;
}

export class ConnectOnboardingDto {
  @ApiPropertyOptional({
    description:
      "URL de retour après onboarding Stripe (défaut: FRONTEND_URL/dashboard/wallet?connect=done).",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  returnUrl?: string;

  @ApiPropertyOptional({
    description:
      "URL de rafraîchissement si le lien d'onboarding expire (défaut: FRONTEND_URL/dashboard/wallet?connect=refresh).",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshUrl?: string;
}

export class StartKycVerificationDto {
  @ApiProperty({ example: 1, description: 'ID utilisateur' })
  @IsInt()
  userId: number;

  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  email: string;
}
