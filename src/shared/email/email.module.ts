import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplateEntity } from './entities/email-template.entity';
import { EmailTemplateService } from './email-template.service';
import { EMAIL_SERVICE } from './email.service';
import { emailServiceProvider } from './email-driver.provider';

/**
 * Module global de l'email : templates ET transport.
 *
 * `EMAIL_SERVICE` est désormais fourni ici, une seule fois, par
 * `emailServiceProvider` (Mailpit en dev, Brevo en prod — cf.
 * email-driver.provider.ts). Les six modules qui liaient chacun
 * `useClass: BrevoEmailService` en local n'ont plus à le faire : le driver
 * se choisit à un seul endroit.
 *
 * Le seed des templates par défaut se fait au bootstrap
 * (EmailTemplateService.onModuleInit → seedDefaults, idempotent).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplateEntity])],
  providers: [EmailTemplateService, emailServiceProvider],
  exports: [EmailTemplateService, EMAIL_SERVICE],
})
export class EmailModule {}
