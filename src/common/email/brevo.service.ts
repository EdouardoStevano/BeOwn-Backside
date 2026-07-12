import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { renderTemplate } from './template-renderer';

@Injectable()
export class BrevoEmailService implements EmailService {
  private readonly logger = new Logger(BrevoEmailService.name);
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly apiUrl = 'https://api.brevo.com/v3/smtp/email';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow('BREVO_API_KEY');
    this.senderEmail =
      this.config.get('BREVO_SENDER_EMAIL') || 'no-reply@beown.com';
    this.senderName = this.config.get('BREVO_SENDER_NAME') || 'BeOwn';
  }

  async sendActivationEmail(email: string, otp: string): Promise<void> {
    await this.send(
      email,
      'Activez votre compte BeOwn',
      `<h2>Bienvenue sur BeOwn</h2><p>Votre code d'activation : <strong>${otp}</strong></p><p>Ce code expire dans 5 minutes.</p>`,
    );
  }

  async sendTwoFactorCodeEmail(email: string, otp: string): Promise<void> {
    await this.send(
      email,
      'Votre code de connexion BeOwn',
      `<p>Votre code de vérification : <strong>${otp}</strong></p><p>Ce code expire dans 5 minutes.</p>`,
    );
  }

  async sendOtpEmail(
    email: string,
    otp: string,
    expiresIn: string,
  ): Promise<void> {
    await this.send(
      email,
      'Votre code de vérification BeOwn',
      renderTemplate('otp-code', { otp, expiresIn }),
    );
  }

  async sendEmailVerificationLink(
    email: string,
    confirmEmailUrl: string,
  ): Promise<void> {
    await this.send(
      email,
      'Confirmez votre adresse email',
      renderTemplate('email-verification', { confirmEmailUrl }),
    );
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/auth/reset-password?token=${token}`;
    await this.send(
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
    await this.send(email, 'Mise à jour de votre dossier KYC', body);
  }

  async sendTransactionalEmail(
    email: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    await this.send(email, subject, htmlContent);
  }

  private async send(
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
