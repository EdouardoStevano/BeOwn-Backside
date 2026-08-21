import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Matches, Max, Min } from 'class-validator';

export class CreatePaymentIntentDto {
  @ApiProperty({ example: 500, description: 'Montant en EUR (plafond de sécurité : 1 000 000 €)' })
  @IsPositive()
  @Max(1_000_000, { message: 'Le montant du dépôt dépasse le plafond autorisé.' })
  amount: number;

  @ApiProperty({ example: 'EUR', description: "Code devise ISO 4217 (seule la devise EUR est acceptée)" })
  @IsString()
  @IsIn(['EUR'], { message: 'Seule la devise EUR est acceptée.' })
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

  @ApiPropertyOptional({
    example: 'card_1Nxxxx',
    description:
      "Destination de retrait (external account Stripe) choisie par l'investisseur. " +
      'Optionnel : sans cette valeur ni `method`, le retrait conserve son comportement ' +
      "historique. L'appartenance de la destination au compte connecté de l'appelant " +
      'est vérifiée avant tout débit du wallet.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(card|ba)_[A-Za-z0-9]+$/, {
    message: 'Destination de retrait invalide.',
  })
  payoutMethodId?: string;

  @ApiPropertyOptional({
    example: 'instant',
    enum: ['instant', 'standard'],
    description:
      'Mode de versement. `instant` exige une destination éligible au virement instantané ' +
      'et un montant compris entre 10 € et 9 999 €.',
  })
  @IsOptional()
  @IsIn(['instant', 'standard'], {
    message: 'Mode de versement invalide (attendu : instant ou standard).',
  })
  method?: 'instant' | 'standard';
}

/**
 * Ajout d'une destination de retrait. Le backend n'accepte QU'UN TOKEN Stripe.js
 * (`tok_...`) : aucun numéro de carte ni cryptogramme ne doit transiter par
 * l'API BeOwn — le format est verrouillé ici, à la frontière.
 */
export class AttachPayoutMethodDto {
  @ApiProperty({
    example: 'tok_1Nxxxx',
    description:
      'Token Stripe.js de la carte de débit. JAMAIS de PAN ni de CVC : la tokenisation ' +
      'est faite côté navigateur par Stripe.js.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^tok_[A-Za-z0-9_]+$/, {
    message: 'Token de carte invalide.',
  })
  token: string;
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
