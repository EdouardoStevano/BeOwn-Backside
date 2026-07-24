import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Public } from 'src/common/auth/public.decorator';
import { EMAIL_SERVICE, type EmailService } from 'src/common/email/email.service';
import { PlatformSettingsService } from 'src/common/platform-settings/platform-settings.service';

class ContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nom: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sujet?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
    private readonly settings: PlatformSettingsService,
  ) {}

  @ApiOperation({
    summary: 'Envoyer un message depuis le formulaire de contact public',
  })
  @ApiResponse({ status: 200, description: 'Message transmis' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post()
  async submit(@Body() dto: ContactDto): Promise<{ ok: true }> {
    const blob = await this.settings.getSettings();
    const to = blob.platform?.contactEmail || 'contact@beown.fr';
    const sujet = dto.sujet?.trim() || 'Nouveau message';
    const html =
      `<h2>Nouveau message de contact</h2>` +
      `<p><strong>De :</strong> ${escapeHtml(dto.nom)} &lt;${escapeHtml(dto.email)}&gt;</p>` +
      `<p><strong>Sujet :</strong> ${escapeHtml(sujet)}</p>` +
      `<p><strong>Message :</strong></p>` +
      `<p>${escapeHtml(dto.message).replace(/\n/g, '<br>')}</p>`;

    if (this.email.sendTransactionalEmail) {
      await this.email.sendTransactionalEmail(to, `[Contact] ${sujet}`, html);
    }
    return { ok: true };
  }
}
