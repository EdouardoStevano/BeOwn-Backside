import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { MailerService } from '@nestjs-modules/mailer';
import { formatEur } from 'src/common/money/format-eur';
import { EmailTemplateService } from './email-template.service';

@Injectable()
export class NodemailerMailService implements EmailService {
  private readonly logger = new Logger(NodemailerMailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly templates: EmailTemplateService,
  ) {}

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
   */
  private async sendTemplated(
    key: string,
    email: string,
    vars: Record<string, unknown>,
  ): Promise<void> {
    const rendered = await this.templates.render(key, vars);
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
