import { Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';
import { formatEur } from 'src/shared/money/format-eur';
import { wrapInLayout } from './layout';

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

  /**
   * **Réinitialisation du mot de passe** — le seul email métier qui
   * court-circuitait le rendu.
   *
   * Il passait du HTML brut à `sendHtml` : ni layout, ni charte, ni logo, ni
   * mention légale, et le lien collé en clair au milieu du texte. Il arrivait
   * donc aux styles par défaut du client de messagerie, là où les dix autres
   * arrivent à la charte BeOwn. Il a désormais son template, éditable au
   * back-office comme les autres.
   *
   * **Il ne se saute pas, lui.** `sendTemplated` renonce en silence quand un
   * template est désactivé ou introuvable — acceptable pour une annonce, pas
   * ici : ce lien est le seul chemin de récupération d'un compte, et ne pas
   * l'envoyer enfermerait dehors quelqu'un qui a perdu son mot de passe. Si le
   * rendu ne donne rien, on envoie quand même, dans le layout maison.
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetLink = `${this.frontendUrl}/auth/reset-password?token=${token}`;
    const expiresIn = '30 minutes';

    const rendered = await this.templates.render('password-reset', {
      appUrl: this.appUrl,
      resetLink,
      expiresIn,
    });
    if (rendered) {
      await this.sendHtml(email, rendered.sujet, rendered.html);
      return;
    }

    this.logger.warn(
      `Template "password-reset" indisponible — envoi du message de secours (destinataire : ${email})`,
    );
    await this.sendHtml(
      email,
      SUJET_REINITIALISATION,
      wrapInLayout(
        corpsDeSecoursReinitialisation(resetLink, expiresIn),
        SUJET_REINITIALISATION,
      ),
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

const SUJET_REINITIALISATION = 'Réinitialisation de votre mot de passe BeOwn';

/**
 * Le corps de secours, si le template venait à manquer — mêmes classes que le
 * `.hbs`, donc même charte une fois passé dans `wrapInLayout`. Il dit le
 * strict nécessaire : le bouton, le lien brut au cas où le bouton ne passe
 * pas, et la durée de validité.
 */
const corpsDeSecoursReinitialisation = (
  resetLink: string,
  expiresIn: string,
): string =>
  `<p class="h1">Réinitialisation de votre mot de passe</p>` +
  `<p class="p">Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>` +
  `<a href="${resetLink}" class="btn">Choisir un nouveau mot de passe</a>` +
  `<p class="note">Ce lien expire dans <strong>${expiresIn}</strong> et ne peut servir qu'une fois.</p>` +
  `<div class="card"><a href="${resetLink}">${resetLink}</a></div>`;
