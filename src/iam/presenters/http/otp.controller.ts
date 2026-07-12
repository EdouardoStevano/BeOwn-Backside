import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/auth/public.decorator';
import {
  SendEmailOtpCommand,
  SendSmsOtpCommand,
  SetupTotpCommand,
  VerifyEmailOtpCommand,
  VerifySmsOtpCommand,
  VerifyTotpCommand,
} from 'src/iam/application/otp/commands/otp.commands';
import {
  SendEmailOtpDto,
  SendSmsOtpDto,
  SetupTotpDto,
  VerifyEmailOtpDto,
  VerifySmsOtpDto,
  VerifyTotpDto,
} from './dto/otp.dto';

const OTP_SEND_THROTTLE = {
  short: { ttl: 60_000, limit: 3 },
  medium: { ttl: 60_000, limit: 3 },
  auth: { ttl: 60_000, limit: 3 },
};

@ApiTags('OTP / 2FA')
@Controller('otp')
export class OtpController {
  constructor(private readonly commandBus: CommandBus) {}

  @ApiOperation({ summary: 'Envoyer un OTP par email' })
  @ApiResponse({ status: 204, description: 'OTP envoyé' })
  @ApiResponse({
    status: 429,
    description: 'Trop de demandes — réessayez plus tard',
  })
  @Throttle(OTP_SEND_THROTTLE)
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('email/send')
  sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    return this.commandBus.execute(new SendEmailOtpCommand(dto.email));
  }

  @ApiOperation({ summary: "Vérifier l'OTP email" })
  @ApiResponse({ status: 200, description: 'OTP valide ou invalide' })
  @Public()
  @Post('email/verify')
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return this.commandBus.execute(
      new VerifyEmailOtpCommand(dto.email, dto.otp),
    );
  }

  @ApiOperation({ summary: 'Envoyer un OTP par SMS' })
  @ApiResponse({ status: 204, description: 'SMS envoyé' })
  @ApiResponse({
    status: 429,
    description: 'Trop de demandes — réessayez plus tard',
  })
  @Throttle(OTP_SEND_THROTTLE)
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('sms/send')
  sendSmsOtp(@Body() dto: SendSmsOtpDto) {
    return this.commandBus.execute(new SendSmsOtpCommand(dto.phone));
  }

  @ApiOperation({ summary: "Vérifier l'OTP SMS" })
  @ApiResponse({ status: 200, description: 'OTP valide' })
  @Public()
  @Post('sms/verify')
  verifySmsOtp(@Body() dto: VerifySmsOtpDto) {
    return this.commandBus.execute(new VerifySmsOtpCommand(dto.phone, dto.otp));
  }

  @ApiOperation({ summary: 'Configurer le TOTP (Google Authenticator)' })
  @ApiResponse({ status: 201, description: 'Secret + URI pour QR code' })
  @Post('totp/setup')
  setupTotp(@Body() dto: SetupTotpDto) {
    return this.commandBus.execute(new SetupTotpCommand(dto.email));
  }

  @ApiOperation({ summary: 'Vérifier un code TOTP' })
  @ApiResponse({ status: 200, description: 'TOTP valide' })
  @Post('totp/verify')
  verifyTotp(@Body() dto: VerifyTotpDto) {
    return this.commandBus.execute(
      new VerifyTotpCommand(dto.email, dto.otp, dto.secret),
    );
  }
}
