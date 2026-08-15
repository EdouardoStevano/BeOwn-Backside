import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_SERVICE, EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';
import { BrevoEmailService } from './brevo.service';
import { MailpitEmailService } from './mailpit.service';
import { NodemailerEmailService } from './nodemailer.service';
import { PlatformSettingsService } from 'src/common/platform-settings/platform-settings.service';

export type MailDriver = 'brevo' | 'nodemailer' | 'mailpit';

const MAIL_DRIVERS: readonly MailDriver[] = ['brevo', 'nodemailer', 'mailpit'];

/**
 * Environnements déployés qui envoient de vrais emails. Le poste de dev local
 * ne définit pas `NODE_ENV` (voir `.env`) et retombe donc sur Mailpit ; `test`
 * en fait autant, une suite de tests n'ayant aucune raison d'envoyer.
 */
const REAL_SEND_ENVIRONMENTS = ['development', 'staging', 'production'];

/**
 * Driver utilisé sur ces environnements. Brevo reste implémenté et
 * sélectionnable via `MAIL_DRIVER=brevo`, mais le compte n'est pas encore
 * opérationnel (401 « Key not found ») : le défaut est donc SMTP/nodemailer,
 * qui s'appuie sur les `MAIL_*` déjà présents dans le ConfigMap et les Secrets.
 * Repasser cette constante à `'brevo'` le jour où la clé API est valide.
 */
const DEPLOYED_DRIVER: MailDriver = 'nodemailer';

/**
 * Choix du transport, dans cet ordre :
 *   1. `MAIL_DRIVER` s'il est renseigné (brevo | nodemailer | mailpit) —
 *      permet de tester un envoi réel en local, ou d'imposer Mailpit sur un
 *      environnement partagé ;
 *   2. sinon : nodemailer sur les environnements déployés (development,
 *      staging, production), Mailpit partout ailleurs.
 *
 * Le défaut retenu est « Mailpit sauf environnement déployé connu » : la liste
 * est une whitelist, donc un `NODE_ENV` absent ou inattendu ne peut jamais
 * faire sortir d'email réel par accident. `NODE_ENV` est la seule information
 * fiable dont on dispose au démarrage.
 */
export function resolveMailDriver(config: ConfigService): MailDriver {
  const explicit = config.get<string>('MAIL_DRIVER')?.trim().toLowerCase();
  if (explicit && MAIL_DRIVERS.includes(explicit as MailDriver)) {
    return explicit as MailDriver;
  }

  if (explicit) {
    new Logger('EmailDriver').warn(
      `MAIL_DRIVER="${explicit}" inconnu (attendu: ${MAIL_DRIVERS.join(' | ')}) — bascule sur la règle par défaut.`,
    );
  }
  const env = config.get<string>('NODE_ENV')?.trim().toLowerCase();
  return env && REAL_SEND_ENVIRONMENTS.includes(env)
    ? DEPLOYED_DRIVER
    : 'mailpit';
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

    if (driver === 'nodemailer') {
      logger.log(
        `Transport email : SMTP ${config.get('MAIL_HOST')}:${config.get('MAIL_PORT') ?? 587} (envois réels).`,
      );
      return new NodemailerEmailService(config, templates, platformSettings);
    }

    logger.log('Transport email : Brevo (envois réels).');
    return new BrevoEmailService(config, templates, platformSettings);
  },
};
