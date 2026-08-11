import { Inject, Injectable } from '@nestjs/common';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import { AuthMailer } from 'src/iam/domains/ports/auth-mailer.port';
import { emailVerificationHtml } from './templates/email-verification.template';

/**
 * Passe par `EMAIL_SERVICE` et non plus par le `MailerService` de
 * @nestjs-modules/mailer : le transport SMTP a été retiré du projet, il ne
 * reste que deux drivers HTTP (Mailpit en dev, Brevo en prod).
 */
@Injectable()
export class NestAuthMailerAdapter implements AuthMailer {
  constructor(
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  async sendEmailVerificationLink(to: string, token: string): Promise<void> {
    // L'URL pointe vers notre propre API : c'est un détail de déploiement,
    // pas une décision applicative — le use case ne transporte que le token.
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    // `/auth/email/verify` depuis la fusion des features `email-verification`
    // et `otp` dans `authentication` : les liens émis avant ce changement
    // pointent encore sur `/email/verify` et ne résolvent plus. Le TTL du
    // token de vérification étant d'au plus 24h, le lien est simplement à
    // redemander via POST /auth/email/send-verification.
    const confirmEmailUrl = `${apiUrl}/auth/email/verify?token=${token}`;

    await this.emailService.sendTransactionalEmail!(
      to,
      'Confirmez votre adresse email',
      emailVerificationHtml(confirmEmailUrl),
    );
  }

  async sendLoginOtp(to: string, otp: string): Promise<void> {
    const ttl = process.env.OTP_TTL ?? 300;
    await this.emailService.sendTransactionalEmail!(
      to,
      'Votre code de vérification BeOwn',
      `<p>Votre code de vérification est : <strong>${otp}</strong></p>` +
        `<p>Ce code est valable ${ttl} secondes.</p>`,
    );
  }
}
