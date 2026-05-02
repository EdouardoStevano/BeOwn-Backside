import { IsEmail } from 'class-validator';

export class CreateTotpDto {
  @IsEmail()
  email: string;
}
