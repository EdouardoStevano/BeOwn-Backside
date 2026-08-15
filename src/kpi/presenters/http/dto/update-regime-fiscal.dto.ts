import { IsEnum, IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { RegimeFiscal } from 'src/iam/domains/enums/user.enum';

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
