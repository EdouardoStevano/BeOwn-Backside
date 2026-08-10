import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SendEmailVerificationUseCase } from '../../applications/email-verification/usecases/send-email-verification.usecase';
import { ConfirmEmailUseCase } from '../../applications/email-verification/usecases/confirm-email.usecase';
import { EmailVerificationDto } from './dto/email-verification.dto';
import { Public } from 'src/common/auth/public.decorator';
import { emailVerifiedPage } from './views/email-verified.view';

@ApiTags('Email Verification')
@Controller('email')
export class EmailVerificationController {
  constructor(
    private readonly sendEmailVerificationUseCase: SendEmailVerificationUseCase,
    private readonly confirmEmailUseCase: ConfirmEmailUseCase,
  ) {}

  @ApiOperation({ summary: 'Envoyer un email de vérification' })
  @ApiResponse({
    status: 204,
    description:
      'Email envoyé (réponse générique, que le compte existe ou non)',
  })
  @ApiResponse({
    status: 429,
    description: 'Trop de demandes — réessayez plus tard',
  })
  @Throttle({
    short: { ttl: 60_000, limit: 3 },
    medium: { ttl: 60_000, limit: 3 },
    auth: { ttl: 60_000, limit: 3 },
  })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('send-verification')
  sendVerification(@Body() dto: EmailVerificationDto) {
    return this.sendEmailVerificationUseCase.execute(dto.email);
  }

  @ApiOperation({ summary: 'Confirmer un email via token' })
  @ApiResponse({ status: 200, description: 'Email confirmé' })
  @Public()
  @Get('verify')
  async confirmEmail(@Query('token') token: string) {
    const { email } = await this.confirmEmailUseCase.execute(token);
    return emailVerifiedPage(email);
  }
}
