import {
  IsEnum,
  IsIn,
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

  @ApiPropertyOptional({
    example: 'EUR',
    default: 'EUR',
    enum: ['EUR'],
    description: "Devise du portefeuille — seul l'EUR est accepté.",
  })
  @IsOptional()
  @IsString()
  // Chaîne libre, un portefeuille pouvait naître en « XOF », « usd » ou
  // n'importe quoi d'autre. Tous les montants du grand livre, les seuils
  // LCB-FT et les rapprochements sont exprimés en euros SANS conversion :
  // un portefeuille dans une autre devise ferait comparer des grandeurs
  // hétérogènes, silencieusement. La devise n'est pas un champ d'affichage,
  // c'est l'unité de compte du registre.
  @IsIn(['EUR'], { message: 'Seule la devise EUR est acceptée.' })
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
