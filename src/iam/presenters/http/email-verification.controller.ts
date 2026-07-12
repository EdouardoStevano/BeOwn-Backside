import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { type ConfigType } from '@nestjs/config';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/auth/public.decorator';
import { SendVerificationLinkCommand } from 'src/iam/application/email-verification/commands/send-verification-link.command';
import { ConfirmEmailCommand } from 'src/iam/application/email-verification/commands/confirm-email.command';
import appUrlsConfig from 'src/iam/infrastructure/config/app-urls.config';
import { EmailVerificationDto } from './dto/email-verification.dto';
import { renderEmailVerifiedPage } from './views/email-verified.page';

@ApiTags('Email Verification')
@Controller('email')
export class EmailVerificationController {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(appUrlsConfig.KEY)
    private readonly urls: ConfigType<typeof appUrlsConfig>,
  ) {}

  @ApiOperation({ summary: 'Envoyer un email de vérification' })
  @ApiResponse({ status: 204, description: 'Email envoyé' })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('send-verification')
  sendVerification(@Body() dto: EmailVerificationDto): Promise<void> {
    return this.commandBus.execute(new SendVerificationLinkCommand(dto.email));
  }

  @ApiOperation({ summary: 'Confirmer un email via token' })
  @ApiQuery({
    name: 'token',
    description: 'Token de vérification reçu par email',
  })
  @ApiResponse({ status: 200, description: 'Email confirmé — page HTML' })
  @ApiResponse({ status: 401, description: 'Token invalide ou expiré' })
  @Public()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Get('verify')
  async confirmEmail(@Query('token') token: string): Promise<string> {
    const email: string = await this.commandBus.execute(
      new ConfirmEmailCommand(token),
    );

    return renderEmailVerifiedPage(email, this.urls.frontend);
  }
}
