import { Injectable } from '@nestjs/common';
import { EmailService } from './email.service';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class NodemailerMailService implements EmailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendActivationEmail(email: string, otp: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Activez votre compte',
      html: `
        <p>Voici votre code d'activation :</p>
        <h2 style="letter-spacing:4px">${otp}</h2>
        <p>Ce code expire dans <strong>5 minutes</strong>.</p>
      `,
    });
  }

  async sendTwoFactorCodeEmail(email: string, otp: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Votre code de connexion',
      html: `
        <p>Voici votre code de double authentification :</p>
        <h2 style="letter-spacing:4px">${otp}</h2>
        <p>Ce code expire dans <strong>5 minutes</strong>.</p>
      `,
    });
  }

  async sendVerificationEmail(email: string, verificationUrl: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Confirmez votre adresse email',
      text: `Cliquez ici pour confirmer votre email: ${verificationUrl}`,
    });
  }
}
