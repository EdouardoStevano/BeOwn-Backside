import { Injectable } from '@nestjs/common';
import { EmailService } from './email.service';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class NodemailerMailService implements EmailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendActivationEmail(email: string, otp: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Activez votre compte BeOwn',
      template: 'activation',
      context: { otp, expiresIn: '5 minutes' },
    });
  }

  async sendTwoFactorCodeEmail(email: string, otp: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Votre code de connexion BeOwn',
      template: 'two-factor',
      context: { otp, expiresIn: '5 minutes' },
    });
  }

  async sendKycValidatedEmail(email: string, prenom: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Votre identité a été vérifiée ✅',
      template: 'kyc-validated',
      context: { prenom },
    });
  }

  async sendKycRejectedEmail(email: string, prenom: string, motif?: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Vérification d\'identité — mise à jour requise',
      template: 'kyc-rejected',
      context: { prenom, motif: motif ?? 'Documents non conformes' },
    });
  }

  async sendNewProjectEmail(
    email: string,
    prenom: string,
    projet: { titre: string; ville: string; triCible?: number; url?: string },
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: `Nouveau projet disponible : ${projet.titre}`,
      template: 'new-project',
      context: { prenom, ...projet },
    });
  }

  async sendNewSecondaryOrderEmail(
    email: string,
    prenom: string,
    projet: { titre: string; nbFractions: number; prix: number },
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: `Nouvelle annonce sur le marché secondaire`,
      template: 'new-secondary',
      context: { prenom, ...projet },
    });
  }

  async sendEcheanceEmail(
    email: string,
    prenom: string,
    echeance: { date: string; montant: number; projetTitre: string },
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: `Échéance à venir — ${echeance.projetTitre}`,
      template: 'echeance',
      context: { prenom, ...echeance },
    });
  }

  async sendDepotConfirmedEmail(email: string, prenom: string, montant: number): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Dépôt confirmé sur votre compte BeOwn',
      template: 'depot-confirmed',
      context: { prenom, montant: new Intl.NumberFormat('fr-FR').format(montant) },
    });
  }

  async sendRetraitProcessedEmail(email: string, prenom: string, montant: number): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Votre retrait est en cours de traitement',
      template: 'retrait-processed',
      context: { prenom, montant: new Intl.NumberFormat('fr-FR').format(montant) },
    });
  }
}
