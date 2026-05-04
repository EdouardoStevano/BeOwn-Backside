import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { VerifyEmailService } from './verify-email.service';
import { EmailVerificationDto } from './dto/email-verification.dto';

@ApiTags('Email Verification')
@Controller('email')
export class VerifyEmailController {
  constructor(private readonly verifyEmailService: VerifyEmailService) {}

  @ApiOperation({ summary: 'Envoyer un email de vérification' })
  @ApiResponse({ status: 201, description: 'Email de vérification envoyé' })
  @Post('send-verification')
  async sendVerification(@Body() emailVerificationDto: EmailVerificationDto) {
    await this.verifyEmailService.sendVerificationEmail(emailVerificationDto);
    return { message: 'Email de confirmation envoyé' };
  }

  @ApiOperation({ summary: 'Confirmer un email via token' })
  @ApiQuery({
    name: 'token',
    description: 'Token de vérification reçu par email',
  })
  @ApiResponse({ status: 200, description: 'Email vérifié avec succès' })
  @ApiResponse({ status: 400, description: 'Token invalide ou expiré' })
  @Get('verify')
  async verify(@Query('token') token: string) {
    const email = await this.verifyEmailService.confirmEmail(token);
    return { message: `Email ${email} verifié avec succés ` };
  }
}
