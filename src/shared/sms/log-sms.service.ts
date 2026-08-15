import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

/**
 * Driver SMS de développement : rien ne part sur le réseau, tout passe dans les
 * logs. L'équivalent de Mailpit côté email — un parcours OTP ou 2FA se déroule
 * en entier sur un poste de dev, sans compte Twilio et sans SMS facturé.
 *
 * S'appelait `NoopSmsService`, ce qui le sous-vendait : il ne fait pas rien, il
 * trace. Et il ne lève jamais, de sorte qu'un environnement sans transport ne
 * casse pas le contrat (non énumérant) des envois.
 */
@Injectable()
export class LogSmsService implements SmsService {
  private readonly logger = new Logger(LogSmsService.name);

  constructor(private readonly config: ConfigService) {}

  // `Promise.resolve()` explicite plutôt qu'`async` sans `await` : rien n'est
  // asynchrone ici, seule la signature du port l'impose.
  sendOtp(phoneNumber: string, code: string): Promise<void> {
    // Le code est écrit en clair **hors production seulement**. C'est tout
    // l'intérêt du driver : sans lui, impossible de terminer un enrôlement SMS
    // en local, faute de recevoir quoi que ce soit. En production ce driver ne
    // sert que de filet quand Twilio n'est pas configuré, et là un OTP dans les
    // logs serait un identifiant de connexion en clair dans la stack de logs.
    if (this.isProduction()) {
      this.logger.warn(
        `SMS non envoyé (driver log actif en production) — OTP à destination de ${phoneNumber} perdu. Configurer Twilio.`,
      );
      return Promise.resolve();
    }

    this.logger.log(`[SMS-LOG] OTP pour ${phoneNumber} : ${code}`);
    return Promise.resolve();
  }

  sendTransactional(phoneNumber: string, message: string): Promise<void> {
    if (this.isProduction()) {
      this.logger.warn(
        `SMS non envoyé (driver log actif en production) — message à destination de ${phoneNumber} perdu. Configurer Twilio.`,
      );
      return Promise.resolve();
    }

    this.logger.log(`[SMS-LOG] Message pour ${phoneNumber} : ${message}`);
    return Promise.resolve();
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}
