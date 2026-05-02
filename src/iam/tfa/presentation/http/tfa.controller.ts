import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/iam/authentication/infrastructures/guards/jwt-auth.guard';
import { CurrentUser } from 'src/iam/authentication/presenters/http/decorators/current-user.decorator';
import type { TokenPayload } from 'src/iam/domain/ports/token.service';
import { InitiateEmailTfaUseCase } from '../../application/usecases/initiate-email-tfa.usecase';
import { ConfirmEmailTfaUseCase } from '../../application/usecases/confirm-email-tfa.usecase';
import { DisableEmailTfaUseCase } from '../../application/usecases/disable-email-tfa.usecase';
import { VerifyEmailOtpUseCase } from '../../application/usecases/verify-email-otp.usecase';
import { ConfirmEmailTfaDto, VerifyEmailOtpDto } from './dto/tfa.dto';

@ApiTags('2FA - Email')
@Controller('auth/2fa/email')
export class TfaController {
  constructor(
    private readonly initiateEmailTfaUseCase: InitiateEmailTfaUseCase,
    private readonly confirmEmailTfaUseCase: ConfirmEmailTfaUseCase,
    private readonly disableEmailTfaUseCase: DisableEmailTfaUseCase,
    private readonly verifyEmailOtpUseCase: VerifyEmailOtpUseCase,
  ) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initier l\'activation de la 2FA par email' })
  @ApiResponse({ status: 200, description: 'OTP envoyé par email' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('enable')
  enable(@CurrentUser() user: TokenPayload) {
    return this.initiateEmailTfaUseCase.execute(user.sub);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirmer l\'activation de la 2FA par email' })
  @ApiResponse({ status: 200, description: '2FA activée avec succès' })
  @ApiResponse({ status: 401, description: 'OTP invalide ou expiré' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('confirm')
  confirm(
    @CurrentUser() user: TokenPayload,
    @Body() dto: ConfirmEmailTfaDto,
  ) {
    return this.confirmEmailTfaUseCase.execute(user.sub, dto.otp);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Désactiver la 2FA par email' })
  @ApiResponse({ status: 200, description: '2FA désactivée avec succès' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Delete()
  disable(@CurrentUser() user: TokenPayload) {
    return this.disableEmailTfaUseCase.execute(user.sub);
  }

  @ApiOperation({ summary: 'Vérifier le code OTP lors de la connexion' })
  @ApiResponse({ status: 200, description: 'Tokens retournés avec succès' })
  @ApiResponse({ status: 401, description: 'OTP ou token de session invalide' })
  @HttpCode(HttpStatus.OK)
  @Post('verify')
  verify(@Body() dto: VerifyEmailOtpDto) {
    return this.verifyEmailOtpUseCase.execute(dto.twoFactorToken, dto.otp);
  }
}
