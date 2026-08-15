import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_SERVICE, EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';
import { BrevoEmailService } from './brevo.service';
import { MailpitEmailService } from './mailpit.service';
import { PlatformSettingsService } from 'src/common/platform-settings/platform-settings.service';

export type MailDriver = 'brevo' | 'mailpit';

/**
 * Environnements déployés qui envoient de vrais emails via Brevo. Le poste de
 * dev local ne définit pas `NODE_ENV` (voir `.env`) et retombe donc sur
 * Mailpit ; `test` en fait autant, une suite de tests n'ayant aucune raison de
 * consommer du quota Brevo.
 */
const BREVO_ENVIRONMENTS = ['development', 'staging', 'production'];

/**
 * Choix du transport, dans cet ordre :
 *   1. `MAIL_DRIVER` s'il est renseigné (brevo | mailpit) — permet de tester
 *      Brevo en local, ou d'imposer Mailpit sur un environnement partagé ;
 *   2. sinon : Brevo sur les environnements déployés (development, staging,
 *      production), Mailpit partout ailleurs.
 *
 * Le défaut retenu est « Mailpit sauf environnement déployé connu » : la liste
 * est une whitelist, donc un `NODE_ENV` absent ou inattendu ne peut jamais
 * faire sortir d'email réel par accident. `NODE_ENV` est la seule information
 * fiable dont on dispose au démarrage.
 */
export function resolveMailDriver(config: ConfigService): MailDriver {
  const explicit = config.get<string>('MAIL_DRIVER')?.trim().toLowerCase();
  if (explicit === 'brevo' || explicit === 'mailpit') return explicit;

  if (explicit) {
    new Logger('EmailDriver').warn(
      `MAIL_DRIVER="${explicit}" inconnu (attendu: brevo | mailpit) — bascule sur la règle par défaut.`,
    );
  }
  const env = config.get<string>('NODE_ENV')?.trim().toLowerCase();
  return env && BREVO_ENVIRONMENTS.includes(env) ? 'brevo' : 'mailpit';
}

/**
 * EMAIL_SERVICE est résolu ici une seule fois, et exporté globalement par
 * EmailModule. Auparavant six modules faisaient chacun
 * `{ provide: EMAIL_SERVICE, useClass: BrevoEmailService }` : le driver était
 * codé en dur six fois, et en changer imposait six modifications.
 */
export const emailServiceProvider: Provider = {
  provide: EMAIL_SERVICE,
  inject: [ConfigService, EmailTemplateService, PlatformSettingsService],
  useFactory: (
    config: ConfigService,
    templates: EmailTemplateService,
    platformSettings: PlatformSettingsService,
  ): EmailService => {
    const driver = resolveMailDriver(config);
    const logger = new Logger('EmailDriver');

    if (driver === 'mailpit') {
      logger.log(
        `Transport email : Mailpit (${config.get('MAILPIT_URL') || 'http://localhost:8025'}) — aucun email ne sort.`,
      );
      return new MailpitEmailService(config, templates);
    }

    logger.log('Transport email : Brevo (envois réels).');
    return new BrevoEmailService(config, templates, platformSettings);
  },
};
