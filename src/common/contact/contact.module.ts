import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';

/**
 * Formulaire de contact public → email vers l'adresse de contact plateforme.
 * EMAIL_SERVICE vient du EmailModule global (driver Mailpit ou Brevo selon
 * l'environnement) : plus de binding local.
 */
@Module({
  controllers: [ContactController],
})
export class ContactModule {}
