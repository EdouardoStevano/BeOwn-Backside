import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreatePaymentIntentDto {
  @ApiProperty({ example: 50000, description: 'Montant en XOF/EUR' })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'XOF', description: 'Code devise ISO 4217' })
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
  @ApiProperty({ example: 10000, description: 'Montant à retirer' })
  @IsPositive()
  @Min(1000)
  amount: number;

  @ApiProperty({ example: 'XOF' })
  @IsString()
  currency: string;

  @ApiProperty({ example: 'wallet-uuid', description: 'ID du wallet source' })
  @IsString()
  walletId: string;

  @ApiProperty({ example: 'SN0800100000015000000160', description: 'IBAN ou numéro de compte destinataire' })
  @IsString()
  ibanDestination: string;
}

export class StartKycVerificationDto {
  @ApiProperty({ example: 1, description: 'ID utilisateur' })
  @IsInt()
  userId: number;

  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  email: string;
}
