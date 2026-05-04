import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { InitiateEmailTfaUseCase } from '../../application/usecases/initiate-email-tfa.usecase';
import { ConfirmEmailTfaUseCase } from '../../application/usecases/confirm-email-tfa.usecase';
import { DisableEmailTfaUseCase } from '../../application/usecases/disable-email-tfa.usecase';
import { VerifyEmailOtpUseCase } from '../../application/usecases/verify-email-otp.usecase';
import { InitiateTotpUseCase } from '../../application/usecases/initiate-totp.usecase';
import { DisableTotpUseCase } from '../../application/usecases/disable-totp.usecase';
import { VerifyTotpUseCase } from '../../application/usecases/verify-totp.usecase';
import { ConfirmEmailTfaDto, VerifyEmailOtpDto, VerifyTotpDto } from './dto/tfa.dto';

@ApiTags('2FA')
@Controller('auth/2fa')
export class TfaController {
  constructor(
    private readonly initiateEmailTfaUseCase: InitiateEmailTfaUseCase,
    private readonly confirmEmailTfaUseCase: ConfirmEmailTfaUseCase,
    private readonly disableEmailTfaUseCase: DisableEmailTfaUseCase,
    private readonly verifyEmailOtpUseCase: VerifyEmailOtpUseCase,
    private readonly initiateTotpUseCase: InitiateTotpUseCase,
    private readonly disableTotpUseCase: DisableTotpUseCase,
    private readonly verifyTotpUseCase: VerifyTotpUseCase,
  ) {}

  // ── Email OTP ─────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @ApiOperation({ summary: "Initier l'activation 2FA email (envoie un OTP)" })
  @ApiResponse({ status: 200, description: 'OTP envoyé par email' })
  @ApiResponse({ status: 409, description: 'Une autre méthode 2FA est déjà active' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('email/enable')
  enableEmail(@CurrentUser() user: ActiveUser) {
    return this.initiateEmailTfaUseCase.execute(user.userId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Confirmer l'activation 2FA email" })
  @ApiResponse({ status: 200, description: '2FA email activée avec succès' })
  @ApiResponse({ status: 401, description: 'OTP invalide ou expiré' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('email/confirm')
  confirmEmail(@CurrentUser() user: ActiveUser, @Body() dto: ConfirmEmailTfaDto) {
    return this.confirmEmailTfaUseCase.execute(user.userId, dto.otp);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '2FA email désactivée' })
  @ApiResponse({ status: 200, description: '2FA email désactivée' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Delete('email')
  disableEmail(@CurrentUser() user: ActiveUser) {
    return this.disableEmailTfaUseCase.execute(user.userId);
  }

  @ApiOperation({ summary: "Vérifier l'OTP email lors de la connexion" })
  @ApiResponse({ status: 200, description: 'Tokens retournés avec succès' })
  @ApiResponse({ status: 401, description: 'OTP ou token de session invalide' })
  @HttpCode(HttpStatus.OK)
  @Post('email/verify')
  verifyEmail(@Body() dto: VerifyEmailOtpDto) {
    return this.verifyEmailOtpUseCase.execute(dto.twoFactorToken, dto.otp);
  }

  // ── TOTP (Authy / Google Authenticator) ───────────────────────────────────

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activer le TOTP — retourne un QR code PNG à scanner dans Authy' })
  @ApiResponse({ status: 200, description: 'QR code PNG (Content-Type: image/png). Le secret TOTP est dans le header X-TOTP-Secret pour saisie manuelle.' })
  @ApiResponse({ status: 409, description: 'Une autre méthode 2FA est déjà active' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('totp/enable')
  async enableTotp(
    @CurrentUser() user: ActiveUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { uri, secret } = await this.initiateTotpUseCase.execute(user.userId);
    const buffer = await QRCode.toBuffer(uri);
    res.setHeader('X-TOTP-Secret', secret);
    return new StreamableFile(buffer, { type: 'image/png' });
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Désactiver le TOTP' })
  @ApiResponse({ status: 200, description: 'TOTP désactivé' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Delete('totp')
  disableTotp(@CurrentUser() user: ActiveUser) {
    return this.disableTotpUseCase.execute(user.userId);
  }

  @ApiOperation({ summary: 'Vérifier le code TOTP lors de la connexion' })
  @ApiResponse({ status: 200, description: 'Tokens retournés avec succès' })
  @ApiResponse({ status: 401, description: 'Code TOTP ou token de session invalide' })
  @HttpCode(HttpStatus.OK)
  @Post('totp/verify')
  verifyTotp(@Body() dto: VerifyTotpDto) {
    return this.verifyTotpUseCase.execute(dto.twoFactorToken, dto.totp);
  }
}
