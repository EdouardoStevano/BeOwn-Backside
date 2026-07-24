import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { MailerService } from '@nestjs-modules/mailer';
import { formatEur } from 'src/common/money/format-eur';
import { EmailTemplateService } from './email-template.service';

@Injectable()
export class NodemailerMailService implements EmailService {
  private readonly logger = new Logger(NodemailerMailService.name);
  /** Base des liens « Accéder à mon espace » des templates (variable {{appUrl}}). */
  private readonly appUrl: string;

  constructor(
    private readonly mailerService: MailerService,
    private readonly templates: EmailTemplateService,
    private readonly config: ConfigService,
  ) {
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

  async sendOtpEmail(
    email: string,
    otp: string,
    expiresIn: string,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Votre code de vérification BeOwn',
      template: 'otp-code',
      context: { otp, expiresIn },
    });
  }

  async sendPasswordResetEmail(
    email: string,
    token: string,
    expiresIn: string,
  ): Promise<void> {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    await this.mailerService.sendMail({
      to: email,
      subject: 'Réinitialisation de votre mot de passe BeOwn',
      template: 'password-reset',
      context: {
        resetLink: `${frontendUrl}/auth/reset-password?token=${token}`,
        expiresIn,
      },
    });
  }

  async sendEmailVerificationLink(
    email: string,
    confirmEmailUrl: string,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Confirmez votre adresse email',
      template: 'email-verification',
      context: { confirmEmailUrl },
    });
  }

  async sendKycValidatedEmail(email: string, prenom: string): Promise<void> {
    await this.sendTemplated('kyc-validated', email, { prenom });
  }

  async sendKycRejectedEmail(
    email: string,
    prenom: string,
    motif?: string,
  ): Promise<void> {
    await this.sendTemplated('kyc-rejected', email, {
      prenom,
      motif: motif ?? 'Documents non conformes',
    });
  }

  async sendNewProjectEmail(
    email: string,
    prenom: string,
    projet: { titre: string; ville: string; triCible?: number; url?: string },
  ): Promise<void> {
    await this.sendTemplated('new-project', email, { prenom, ...projet });
  }

  async sendNewSecondaryOrderEmail(
    email: string,
    prenom: string,
    projet: { titre: string; nbFractions: number; prix: number },
  ): Promise<void> {
    await this.sendTemplated('new-secondary', email, {
      prenom,
      ...projet,
      prix: formatEur(projet.prix),
    });
  }

  async sendEcheanceEmail(
    email: string,
    prenom: string,
    echeance: { date: string; montant: number; projetTitre: string },
  ): Promise<void> {
    await this.sendTemplated('echeance', email, {
      prenom,
      ...echeance,
      montant: formatEur(echeance.montant),
    });
  }

  async sendDepotConfirmedEmail(
    email: string,
    prenom: string,
    montant: number,
  ): Promise<void> {
    await this.sendTemplated('depot-confirmed', email, {
      prenom,
      montant: formatEur(montant),
    });
  }

  async sendRetraitProcessedEmail(
    email: string,
    prenom: string,
    montant: number,
  ): Promise<void> {
    await this.sendTemplated('retrait-processed', email, {
      prenom,
      montant: formatEur(montant),
    });
  }

  /**
   * Rendu centralisé (template DB éditable, fallback .hbs du code) puis envoi
   * via l'unique transport sendHtml. render → null (template désactivé ou
   * introuvable) : on loggue et on n'envoie pas.
   *
   * `appUrl` est injecté dans le contexte de TOUS les templates : plusieurs
   * .hbs (kyc-validated, kyc-rejected, new-secondary) déclarent {{appUrl}}
   * pour leur bouton d'action, sans quoi le lien serait rendu vide. Les
   * variables explicites de l'appelant restent prioritaires (spread après).
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
    email: string,
    sujet: string,
    html: string,
  ): Promise<void> {
    await this.mailerService.sendMail({ to: email, subject: sujet, html });
  }
}
