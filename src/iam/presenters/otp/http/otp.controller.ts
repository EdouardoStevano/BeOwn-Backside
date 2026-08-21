import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/common/auth/public.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateEmailOtpUseCase,
  SendEmailOtpDto,
  VerifyEmailOtpDto,
} from '../../../applications/otp/applications/usecases/create-email-otp.usecase';
import {
  CreateTotpUseCase,
  SetupTotpDto,
  VerifyTotpDto,
} from '../../../applications/otp/applications/usecases/create-totp.usecase';
import {
  CreateSmsOtpUseCase,
  SendSmsOtpDto,
  VerifySmsOtpDto,
} from '../../../applications/otp/applications/usecases/create-sms-otp.usecase';

@ApiTags('OTP / 2FA')
@Controller('otp')
export class OtpController {
  constructor(
    private readonly emailOtpUseCase: CreateEmailOtpUseCase,
    private readonly totpUseCase: CreateTotpUseCase,
    private readonly smsOtpUseCase: CreateSmsOtpUseCase,
  ) {}

  @ApiOperation({ summary: 'Envoyer un OTP par email' })
  @ApiResponse({ status: 204, description: 'OTP envoyé' })
  @ApiResponse({ status: 429, description: 'Trop de demandes — réessayez plus tard' })
  @Throttle({ short: { ttl: 60_000, limit: 3 }, medium: { ttl: 60_000, limit: 3 }, auth: { ttl: 60_000, limit: 3 } })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('email/send')
  sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    return this.emailOtpUseCase.send(dto);
  }

  @ApiOperation({ summary: "Vérifier l'OTP email" })
  @ApiResponse({ status: 200, description: 'OTP valide ou invalide' })
  @ApiResponse({ status: 429, description: 'Trop de tentatives' })
  // M-5 — la vérification n'avait aucun palier dédié (contrairement à l'envoi) :
  // le compteur de 5 essais par OTP restait la seule barrière, réarmable en
  // redemandant un code. On borne aussi la cadence par IP.
  @Throttle({ short: { ttl: 60_000, limit: 10 }, auth: { ttl: 900_000, limit: 30 } })
  @Public()
  @Post('email/verify')
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return this.emailOtpUseCase.verify(dto);
  }

  @ApiOperation({ summary: 'Configurer le TOTP (Google Authenticator)' })
  @ApiResponse({ status: 201, description: 'Secret + URI pour QR code' })
  @Post('totp/setup')
  setupTotp(
    @Body() _dto: SetupTotpDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.totpUseCase.setup(user.userId, user.email);
  }

  @ApiOperation({ summary: 'Vérifier un code TOTP' })
  @ApiResponse({ status: 200, description: 'TOTP valide' })
  @Post('totp/verify')
  verifyTotp(
    @Body() dto: VerifyTotpDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.totpUseCase.verify(user.userId, dto);
  }

  @ApiOperation({ summary: 'Envoyer un OTP par SMS' })
  @ApiResponse({ status: 204, description: 'SMS envoyé' })
  @ApiResponse({ status: 429, description: 'Trop de demandes — réessayez plus tard' })
  @Throttle({ short: { ttl: 60_000, limit: 3 }, medium: { ttl: 60_000, limit: 3 }, auth: { ttl: 60_000, limit: 3 } })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('sms/send')
  sendSmsOtp(@Body() dto: SendSmsOtpDto) {
    return this.smsOtpUseCase.send(dto);
  }

  @ApiOperation({ summary: "Vérifier l'OTP SMS" })
  @ApiResponse({ status: 200, description: 'OTP valide' })
  @ApiResponse({ status: 429, description: 'Trop de tentatives' })
  @Throttle({ short: { ttl: 60_000, limit: 10 }, auth: { ttl: 900_000, limit: 30 } })
  @Public()
  @Post('sms/verify')
  verifySmsOtp(@Body() dto: VerifySmsOtpDto) {
    return this.smsOtpUseCase.verify(dto);
  }
}
