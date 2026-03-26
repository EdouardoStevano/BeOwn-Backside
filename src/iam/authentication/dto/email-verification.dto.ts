import { IsEmail } from 'class-validator';

export class MailVerificationDto {
  @IsEmail()
  email: string;
}
