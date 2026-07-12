import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class SendEmailOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}

export class VerifyEmailOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  otp: string;
}

export class SetupTotpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}

export class VerifyTotpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '123456',
    description: "Code TOTP généré par l'application authenticator",
  })
  @IsString()
  otp: string;

  @ApiProperty({
    example: 'JBSWY3DPEHPK3PXP',
    description: 'Secret TOTP (fourni lors du setup)',
  })
  @IsString()
  secret: string;
}

export class SendSmsOtpDto {
  @ApiProperty({ example: '+33612345678', description: 'E.164 phone number' })
  @IsString()
  phone: string;
}

export class VerifySmsOtpDto {
  @ApiProperty({ example: '+33612345678' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  otp: string;
}
