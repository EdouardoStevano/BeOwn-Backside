import { IsEnum, IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { RegimeFiscal } from 'src/users/infrastructure/persistences/entities/user.entity';

export class UpdateRegimeFiscalDto {
  @IsEnum(RegimeFiscal)
  regimeFiscal: RegimeFiscal;

  @ValidateIf((o) => o.regimeFiscal === RegimeFiscal.BAREME)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(0.45)
  @IsOptional()
  tauxBaremeMarginal?: number;
}
