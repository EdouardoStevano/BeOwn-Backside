import { IsEmail, IsEmpty } from 'class-validator';

export class SignInDto {
  @IsEmail()
  email: string;

  @IsEmpty()
  password: string;
}
