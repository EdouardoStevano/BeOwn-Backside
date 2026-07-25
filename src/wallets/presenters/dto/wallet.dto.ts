import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TransactionFournisseur,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';

export class CreateWalletDto {
  @ApiProperty({ enum: WalletType })
  @IsEnum(WalletType)
  type: WalletType;

  @ApiProperty({ example: 'stripe_wallet_id_xxx' })
  @IsNotEmpty()
  @IsString()
  fournisseurRef: string;

  @ApiPropertyOptional({ example: 'EUR', default: 'EUR' })
  @IsOptional()
  @IsString()
  devise?: string;
}

export class CreateTransactionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  walletSourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  walletDestinationId?: string;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @IsPositive()
  montant: number;

  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiPropertyOptional({ enum: TransactionFournisseur })
  @IsOptional()
  @IsEnum(TransactionFournisseur)
  fournisseur?: TransactionFournisseur;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  investissementId?: string;
}
