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
      template: './activation',
      context: { otp, expiresIn: '5 minutes' },
    });
  }

  async sendTwoFactorCodeEmail(email: string, otp: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Votre code de connexion',
      template: './two-factor',
      context: { otp, expiresIn: '5 minutes' },
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
