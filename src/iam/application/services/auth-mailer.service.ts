import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/shared/email/email.service';
import { emailVerificationHtml } from 'src/iam/infrastructure/mailer/templates/email-verification.template';
import { loginOtpHtml } from 'src/iam/infrastructure/mailer/templates/login-otp.template';
import { totpQrHtml } from 'src/iam/infrastructure/mailer/templates/totp-qr.template';

/** Repli de durée de validité, aligné sur celui d'`OtpService`. */
const DEFAULT_OTP_TTL_SECONDS = 30;

/**
 * Emails transactionnels du parcours d'authentification : à qui, avec quelles
 * données, sous quel objet.
 *
 * Un service et non un port. `AuthMailer` en était un, mais aucune de ses deux
 * méthodes ne bougeait quand le transport changeait : passer de Brevo à un
 * autre expéditeur ne modifie ni l'URL de confirmation ni la durée annoncée.
 * Cette variabilité-là est déjà absorbée par `EMAIL_SERVICE`
 * (`shared/email/`), le seul port de la chaîne.
 *
 * Le balisage, lui, vit dans `infrastructure/mailer/templates/` et n'est
 * qu'importé ici. C'est un import descendant assumé — `applications/` vers
 * `infrastructure/` — au même titre que `jwt.config` dans `TokenService` ou
 * `UserEntity` dans `DeleteAccountUseCase` : le choix a été de garder le HTML
 * hors de cette couche sans payer un port et un adapter pour l'atteindre.
 */
@Injectable()
export class AuthMailerService {
  constructor(
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /** Lien de confirmation d'adresse email (`GET /auth/email/verify`). */
  async sendEmailVerificationLink(to: string, token: string): Promise<void> {
    // L'URL pointe vers notre propre API : c'est un détail de déploiement,
    // pas une décision applicative — le use case ne transporte que le token.
    const apiUrl =
      this.configService.get<string>('API_URL') ?? 'http://localhost:3001';
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

  /** Code OTP à usage unique du parcours 2FA/connexion. */
  async sendLoginOtp(to: string, otp: string): Promise<void> {
    const ttlSeconds =
      this.configService.get<number>('OTP_TTL') ?? DEFAULT_OTP_TTL_SECONDS;

    await this.emailService.sendTransactionalEmail!(
      to,
      'Votre code de vérification BeOwn',
      loginOtpHtml(otp, ttlSeconds),
    );
  }

  /**
   * QR code d'enrôlement TOTP — **développement local uniquement**.
   *
   * Un client comme Postman ne sait pas dessiner l'URI `otpauth://` que rend
   * `POST /auth/mfa/enroll` : sans image, le facteur est inajoutable à une
   * application authenticator. Ce message comble ce trou en local.
   *
   * L'appelant décide de l'envoi (cf. `TotpEnrollmentStrategy`) ; ce service ne
   * fait que composer et remettre au transport.
   */
  async sendTotpQrCode(to: string, uri: string, secret: string): Promise<void> {
    await this.emailService.sendTransactionalEmail!(
      to,
      '[DEV] Votre QR code d’authentification BeOwn',
      await totpQrHtml(uri, secret),
    );
  }
}
