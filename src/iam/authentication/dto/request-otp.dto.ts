import { IsEmail } from 'class-validator';

export class RequestOtpDto {
  @IsEmail({}, { message: 'Email invalide' })
  email: string;
}
