import { Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';
import { formatEur } from 'src/common/money/format-eur';

/**
 * Socle commun aux transports email : rendu des templates et composition des
 * messages métier. Les sous-classes n'implémentent que `sendHtml`, c'est-à-dire
 * le transport lui-même (Template Method, §9).
 *
 * Sans ce socle, ajouter un second driver revenait à dupliquer ~150 lignes de
 * logique de rendu — deux copies à maintenir en phase, pour un contenu d'email
 * qui n'a rien de spécifique au fournisseur.
 */
export abstract class TemplatedEmailService implements EmailService {
  protected readonly logger = new Logger(this.constructor.name);

  protected constructor(
    protected readonly templates: EmailTemplateService,
    /** Base des liens « Accéder à mon espace » des templates ({{appUrl}}). */
    protected readonly appUrl: string,
    protected readonly frontendUrl: string,
  ) {}

  /** Transport concret — la seule chose qui distingue Brevo de Mailpit. */
  protected abstract sendHtml(
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<void>;

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
    const resetLink = `${this.frontendUrl}/auth/reset-password?token=${token}`;
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
   * .hbs (kyc-validated, kyc-rejected, new-secondary) déclarent {{appUrl}} pour
   * leur bouton d'action, sans quoi le lien serait rendu vide. Les variables
   * explicites de l'appelant restent prioritaires (spread après).
   */
  protected async sendTemplated(
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
}
