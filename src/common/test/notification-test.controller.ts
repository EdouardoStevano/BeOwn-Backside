import { Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EMAIL_SERVICE } from 'src/shared/email/email.service';
import type { EmailService } from 'src/shared/email/email.service';
import { SMS_SERVICE } from 'src/shared/sms/sms.service';
import type { SmsService } from 'src/shared/sms/sms.service';
import { Public } from 'src/iam/presentation/decorators/public.decorator';

@ApiTags('Dev – Notifications Test')
@Controller('test')
export class NotificationTestController {
  constructor(
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
  ) {}

  @ApiOperation({ summary: 'Send a test email (dev only)' })
  @ApiResponse({ status: 200, description: 'Email envoyé' })
  @Public()
  @Post('email')
  @HttpCode(HttpStatus.OK)
  async testEmail() {
    await this.emailService.sendTransactionalEmail!(
      'edouardostevano@gmail.com',
      'Test BeOwn – Email',
      `<h2>Bonjour depuis BeOwn 🎉</h2>
       <p>Ceci est un email de test envoyé depuis l'environnement de développement.</p>
       <p>L'intégration Brevo fonctionne correctement.</p>`,
    );
    return { ok: true, message: 'Email envoyé à edouardostevano@gmail.com' };
  }

  @ApiOperation({ summary: 'Send a test SMS (dev only)' })
  @ApiResponse({ status: 200, description: 'SMS envoyé' })
  @Public()
  @Post('sms')
  @HttpCode(HttpStatus.OK)
  async testSms() {
    await this.smsService.sendTransactional(
      '+261326507613',
      "[BeOwn] Ceci est un SMS de test. L'intégration Twilio fonctionne correctement.",
    );
    return { ok: true, message: 'SMS envoyé au +261326507613' };
  }
}
