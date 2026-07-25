import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VerifyEmailService } from './verify-email.service';
import { EmailVerificationDto } from './dto/email-verification.dto';
import { Public } from 'src/common/auth/public.decorator';

@ApiTags('Email Verification')
@Controller('email')
export class VerifyEmailController {
  constructor(private readonly verifyEmailService: VerifyEmailService) {}

  @ApiOperation({ summary: 'Envoyer un email de vérification' })
  @ApiResponse({ status: 204, description: 'Email envoyé (réponse générique, que le compte existe ou non)' })
  @ApiResponse({ status: 429, description: 'Trop de demandes — réessayez plus tard' })
  @Throttle({ short: { ttl: 60_000, limit: 3 }, medium: { ttl: 60_000, limit: 3 }, auth: { ttl: 60_000, limit: 3 } })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('send-verification')
  sendVerification(@Body() dto: EmailVerificationDto) {
    return this.verifyEmailService.sendVerificationEmail(dto);
  }

  @ApiOperation({ summary: 'Confirmer un email via token' })
  @ApiResponse({ status: 200, description: 'Email confirmé' })
  @Public()
  @Get('verify')
  confirmEmail(@Query('token') token: string) {
    return this.verifyEmailService.confirmEmail(token);
  }
}
