import { Module } from '@nestjs/common';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { BrevoEmailService } from 'src/common/email/brevo.service';
import { ContactController } from './contact.controller';

/**
 * Formulaire de contact public → email vers l'adresse de contact plateforme.
 * EMAIL_SERVICE est lié localement (même pattern que les autres modules),
 * BrevoEmailService résout ses dépendances via les modules globaux
 * (ConfigModule, EmailModule, PlatformSettingsModule).
 */
@Module({
  controllers: [ContactController],
  providers: [{ provide: EMAIL_SERVICE, useClass: BrevoEmailService }],
})
export class ContactModule {}
