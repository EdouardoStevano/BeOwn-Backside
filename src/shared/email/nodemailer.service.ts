import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { EmailTemplateService } from './email-template.service';
import { PlatformSettingsService } from 'src/common/platform-settings/platform-settings.service';
import { TemplatedEmailService } from './templated-email.service';

/**
 * Transport SMTP générique (nodemailer) — driver des environnements déployés
 * tant que le compte Brevo n'est pas opérationnel.
 *
 * Les variables `MAIL_*` existaient déjà (ConfigMap k8s + `.development.env`)
 * mais n'étaient consommées par aucun driver : ce service les branche enfin.
 * Comme les deux autres transports, il n'implémente que `sendHtml` — le rendu
 * des templates reste dans `TemplatedEmailService`.
 */
@Injectable()
export class NodemailerEmailService extends TemplatedEmailService {
  private readonly transporter: Transporter;
  private readonly senderEmail: string;
  private readonly senderName: string;

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

    const port = Number(this.config.get('MAIL_PORT') ?? 587);

    this.transporter = createTransport({
      host: this.config.getOrThrow<string>('MAIL_HOST'),
      port,
      // 465 = TLS implicite ; 587 (et 25) = connexion claire puis STARTTLS.
      secure: port === 465,
      auth: {
        user: this.config.getOrThrow<string>('MAIL_USER'),
        pass: this.config.getOrThrow<string>('MAIL_USER_PASSWORD'),
      },
    });

    this.senderEmail = this.config.get('MAIL_FROM') || 'no-reply@beown.fr';
    this.senderName = this.config.get('MAIL_FROM_NAME') || 'BeOwn';
  }

  protected async sendHtml(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    // Même règle d'expéditeur que le driver Brevo : le réglage administrable
    // l'emporte sur l'env. ⚠️ Sur un SMTP grand public (Gmail), le serveur
    // exige souvent que le From corresponde au compte authentifié — un
    // expéditeur admin divergent peut être réécrit, voire rejeté.
    const adminFrom = await this.platformSettings.getDefaultEmailFrom();
    const senderEmail = adminFrom ?? this.senderEmail;

    try {
      await this.transporter.sendMail({
        from: { name: this.senderName, address: senderEmail },
        to,
        subject,
        html: htmlContent,
      });

      this.logger.log(`Email sent to ${to}: "${subject}"`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      throw error;
    }
  }
}
