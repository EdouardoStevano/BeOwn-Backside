import { IsEmail, IsNumberString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsNumberString()
  @Length(6, 6, { message: 'Le code OTP doit contenir 6 chiffres' })
  otp: string;
}
