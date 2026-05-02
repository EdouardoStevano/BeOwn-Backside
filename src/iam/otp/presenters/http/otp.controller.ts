import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateEmailOtpUseCase,
  SendEmailOtpDto,
  VerifyEmailOtpDto,
} from '../../applications/usecases/create-email-otp.usecase';
import {
  CreateTotpUseCase,
  SetupTotpDto,
  VerifyTotpDto,
} from '../../applications/usecases/create-totp.usecase';

@ApiTags('OTP / 2FA')
@Controller('otp')
export class OtpController {
  constructor(
    private readonly emailOtpUseCase: CreateEmailOtpUseCase,
    private readonly totpUseCase: CreateTotpUseCase,
  ) {}

  @ApiOperation({ summary: 'Envoyer un OTP par email' })
  @ApiResponse({ status: 204, description: 'OTP envoyé' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('email/send')
  sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    return this.emailOtpUseCase.send(dto);
  }

  @ApiOperation({ summary: "Vérifier l'OTP email" })
  @ApiResponse({ status: 200, description: 'OTP valide ou invalide' })
  @Post('email/verify')
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return this.emailOtpUseCase.verify(dto);
  }

  @ApiOperation({ summary: 'Configurer le TOTP (Google Authenticator)' })
  @ApiResponse({ status: 201, description: 'Secret + URI pour QR code' })
  @Post('totp/setup')
  setupTotp(@Body() dto: SetupTotpDto) {
    return this.totpUseCase.setup(dto);
  }

  @ApiOperation({ summary: 'Vérifier un code TOTP' })
  @ApiResponse({ status: 200, description: 'TOTP valide' })
  @Post('totp/verify')
  verifyTotp(@Body() dto: VerifyTotpDto) {
    return this.totpUseCase.verify(dto);
  }
}
