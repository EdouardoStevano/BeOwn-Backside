import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SendVerificationUseCase } from '../../application/usecases/send-verification.usecase';
import { ConfirmEmailUseCase } from '../../application/usecases/confirm-email.usecase';
import { EmailVerificationDto } from './dto/email-verification.dto';

@ApiTags('Email Verification')
@Controller('email')
export class EmailVerificationController {
  constructor(
    private readonly sendVerificationUseCase: SendVerificationUseCase,
    private readonly confirmEmailUseCase: ConfirmEmailUseCase,
  ) {}

  @ApiOperation({ summary: 'Envoyer un email de vérification' })
  @ApiResponse({ status: 200, description: 'Email de vérification envoyé' })
  @HttpCode(HttpStatus.OK)
  @Post('send-verification')
  async sendVerification(@Body() dto: EmailVerificationDto) {
    await this.sendVerificationUseCase.execute(dto.email);
    return { message: 'Email de confirmation envoyé' };
  }

  @ApiOperation({ summary: 'Confirmer un email via token' })
  @ApiQuery({ name: 'token', description: 'Token de vérification reçu par email' })
  @ApiResponse({ status: 200, description: 'Email vérifié avec succès' })
  @Get('verify')
  async verify(@Query('token') token: string) {
    const email = await this.confirmEmailUseCase.execute(token);
    return { message: `Email ${email} vérifié avec succès` };
  }
}
