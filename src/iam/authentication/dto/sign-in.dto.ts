import { IsEmail, IsNumber, IsOptional, MinLength } from 'class-validator';

export class SignInDto {
  @IsEmail()
  email: string;

  @MinLength(10)
  password: string;

  @IsOptional()
  @IsNumber()
  tfaCode?: string;
}
