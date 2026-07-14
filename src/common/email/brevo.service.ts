import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';

@Injectable()
export class BrevoEmailService implements EmailService {
  private readonly logger = new Logger(BrevoEmailService.name);
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly apiUrl = 'https://api.brevo.com/v3/smtp/email';
  /** Base des liens « Accéder à mon espace » des templates (variable {{appUrl}}). */
  private readonly appUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly templates: EmailTemplateService,
  ) {
    this.apiKey = this.config.getOrThrow('BREVO_API_KEY');
    this.senderEmail =
      this.config.get('BREVO_SENDER_EMAIL') || 'no-reply@beown.com';
    this.senderName = this.config.get('BREVO_SENDER_NAME') || 'BeOwn';
    this.appUrl = this.config.get('FRONTEND_URL') || 'http://localhost:5173';
  }

  async sendActivationEmail(email: string, otp: string): Promise<void> {
    await this.sendTemplated('activation', email, {
      otp,
      expiresIn: '5 minutes',
    });
  }

  async sendTwoFactorCodeEmail(email: string, otp: string): Promise<void> {
    await this.sendTemplated('two-factor', email, {
      otp,
      expiresIn: '5 minutes',
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/auth/reset-password?token=${token}`;
    await this.sendHtml(
      email,
      'Réinitialisation de votre mot de passe BeOwn',
      `<h2>Réinitialisation de mot de passe</h2><p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p><p><a href="${resetLink}">${resetLink}</a></p><p>Ce lien expire dans 30 minutes.</p>`,
    );
  }

  async sendKycStatusEmail(
    email: string,
    status: string,
    motif?: string,
  ): Promise<void> {
    const statusLabels: Record<string, string> = {
      valide: 'validé ✅',
      refuse: 'refusé ❌',
      en_revue: 'en cours de vérification',
      expire: 'expiré — renouvellement requis',
    };
    const label = statusLabels[status] || status;
    let body = `<h2>Mise à jour KYC</h2><p>Votre dossier KYC est désormais : <strong>${label}</strong></p>`;
    if (motif) body += `<p>Motif : ${motif}</p>`;
    await this.sendHtml(email, 'Mise à jour de votre dossier KYC', body);
  }

  async sendTransactionalEmail(
    email: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    await this.sendHtml(email, subject, htmlContent);
  }

  /**
   * Rendu centralisé (template DB éditable, fallback .hbs du code) puis envoi
   * via l'unique transport sendHtml. render → null (template désactivé ou
   * introuvable) : on loggue et on n'envoie pas.
   *
   * `appUrl` est injecté dans le contexte de TOUS les templates : plusieurs
   * .hbs (kyc-validated, kyc-rejected, new-secondary) déclarent {{appUrl}} pour
   * leur bouton d'action, sans quoi le lien serait rendu vide. Les variables
   * explicites de l'appelant restent prioritaires (spread après).
   */
  private async sendTemplated(
    key: string,
    email: string,
    vars: Record<string, unknown>,
  ): Promise<void> {
    const rendered = await this.templates.render(key, {
      appUrl: this.appUrl,
      ...vars,
    });
    if (!rendered) {
      this.logger.log(
        `Template email "${key}" désactivé ou introuvable — envoi ignoré (destinataire : ${email})`,
      );
      return;
    }
    await this.sendHtml(email, rendered.sujet, rendered.html);
  }

  private async sendHtml(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    const payload = {
      sender: { name: this.senderName, email: this.senderEmail },
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
