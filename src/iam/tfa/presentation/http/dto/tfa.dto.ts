import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ConfirmEmailTfaDto {
  @ApiProperty({ example: '123456', description: 'Code OTP reçu par email' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otp: string;
}

export class VerifyEmailOtpDto {
  @ApiProperty({ example: 'uuid-token', description: 'Token de session 2FA' })
  @IsString()
  @IsNotEmpty()
  twoFactorToken: string;

  @ApiProperty({ example: '123456', description: 'Code OTP reçu par email' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otp: string;
}
