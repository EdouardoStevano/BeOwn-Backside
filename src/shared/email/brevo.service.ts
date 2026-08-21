import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailTemplateService } from './email-template.service';
import { PlatformSettingsService } from 'src/common/platform-settings/platform-settings.service';
import { TemplatedEmailService } from './templated-email.service';

/**
 * Transport de production : API transactionnelle Brevo.
 *
 * Toute la composition des messages vit dans `TemplatedEmailService` ; cette
 * classe ne porte que l'appel HTTP et la résolution de l'expéditeur.
 */
@Injectable()
export class BrevoEmailService extends TemplatedEmailService {
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly apiUrl = 'https://api.brevo.com/v3/smtp/email';

  constructor(
    private readonly config: ConfigService,
    templates: EmailTemplateService,
    private readonly platformSettings: PlatformSettingsService,
  ) {
    super(
      templates,
      config.get('FRONTEND_URL') || 'http://localhost:5173',
      config.get('FRONTEND_URL') || 'http://localhost:5173',
    );
    this.apiKey = this.config.getOrThrow('BREVO_API_KEY');
    this.senderEmail =
      this.config.get('BREVO_SENDER_EMAIL') || 'no-reply@beown.fr';
    this.senderName = this.config.get('BREVO_SENDER_NAME') || 'BeOwn';
  }

  protected async sendHtml(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    const adminFrom = await this.platformSettings.getDefaultEmailFrom();
    const senderEmail = adminFrom ?? this.senderEmail;
    const payload = {
      sender: { name: this.senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent,
    };

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.text();
        this.logger.error(`Brevo API error ${res.status}: ${errBody}`);
        throw new Error(`Brevo email failed: ${res.status}`);
      }

      this.logger.log(`Email sent to ${to}: "${subject}"`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      throw error;
    }
  }
}
