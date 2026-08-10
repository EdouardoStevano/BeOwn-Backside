import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailTemplateService } from './email-template.service';
import { TemplatedEmailService } from './templated-email.service';

/**
 * Transport de développement local : Mailpit (`docker compose up mailpit`).
 *
 * Passe par l'API HTTP `POST /api/v1/send` et non par SMTP — c'est ce qui
 * permet de n'avoir aucun client SMTP dans le projet. Rien n'est envoyé sur
 * Internet : tout atterrit dans l'interface web de Mailpit (port 8025).
 */
@Injectable()
export class MailpitEmailService extends TemplatedEmailService {
  private readonly apiUrl: string;
  private readonly senderEmail: string;
  private readonly senderName: string;

  constructor(config: ConfigService, templates: EmailTemplateService) {
    super(
      templates,
      config.get('FRONTEND_URL') || 'http://localhost:5173',
      config.get('FRONTEND_URL') || 'http://localhost:5173',
    );
    const base =
      config.get<string>('MAILPIT_URL') || 'http://localhost:8025';
    this.apiUrl = `${base.replace(/\/+$/, '')}/api/v1/send`;
    this.senderEmail =
      config.get('MAIL_FROM') ||
      config.get('BREVO_SENDER_EMAIL') ||
      'no-reply@beown.local';
    this.senderName = config.get('BREVO_SENDER_NAME') || 'BeOwn (dev)';
  }

  protected async sendHtml(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    const payload = {
      From: { Email: this.senderEmail, Name: this.senderName },
      To: [{ Email: to }],
      Subject: subject,
      HTML: htmlContent,
    };

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        this.logger.error(`Mailpit API error ${res.status}: ${errBody}`);
        throw new Error(`Mailpit email failed: ${res.status}`);
      }

      this.logger.log(`Email capturé par Mailpit pour ${to} : "${subject}"`);
    } catch (error) {
      // Message explicite : l'oubli du `docker compose up mailpit` est la
      // cause n°1 d'échec ici, et l'erreur réseau brute n'aide pas.
      this.logger.error(
        `Échec d'envoi vers Mailpit (${this.apiUrl}) — le conteneur est-il démarré ?`,
        error,
      );
      throw error;
    }
  }
}
