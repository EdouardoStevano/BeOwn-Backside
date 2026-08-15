import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SMS_SERVICE, SmsService } from './sms.service';
import { TwilioSmsService } from './twilio-sms.service';
import { LogSmsService } from './log-sms.service';

export type SmsDriver = 'twilio' | 'log';

const hasTwilioCredentials = (config: ConfigService): boolean =>
  Boolean(
    config.get<string>('TWILIO_ACCOUNT_SID') &&
    config.get<string>('TWILIO_AUTH_TOKEN') &&
    config.get<string>('TWILIO_PHONE_NUMBER'),
  );

/**
 * Choix du transport SMS, dans cet ordre — calqué sur `resolveMailDriver` :
 *   1. `SMS_DRIVER` s'il est renseigné (twilio | log) — permet d'éprouver
 *      Twilio depuis un poste de dev, ou d'imposer les logs sur un
 *      environnement partagé ;
 *   2. sinon : `log` hors production ;
 *   3. en production : Twilio, et `log` en dernier recours s'il n'est pas
 *      configuré — un transport absent ne doit pas empêcher l'app de démarrer.
 *
 * La règle a changé : le driver se décidait à la **présence des identifiants
 * Twilio**, si bien qu'un poste de dev dont le `.env` en contenait envoyait de
 * vrais SMS, facturés, à de vrais numéros. `NODE_ENV` est la seule information
 * fiable au démarrage pour distinguer un poste de dev d'une production, et
 * c'est elle qui tranche désormais.
 *
 * Exportée hors du `useFactory` pour rester testable sans démarrer le
 * conteneur DI (cf. sms.module.spec.ts).
 */
export function resolveSmsDriver(config: ConfigService): SmsDriver {
  const explicit = config.get<string>('SMS_DRIVER')?.trim().toLowerCase();
  if (explicit === 'twilio' || explicit === 'log') return explicit;

  if (explicit) {
    new Logger('SmsDriver').warn(
      `SMS_DRIVER="${explicit}" inconnu (attendu: twilio | log) — bascule sur la règle par défaut.`,
    );
  }

  if (config.get<string>('NODE_ENV') !== 'production') return 'log';

  return hasTwilioCredentials(config) ? 'twilio' : 'log';
}

export function smsServiceFactory(config: ConfigService): SmsService {
  const logger = new Logger('SmsDriver');

  if (resolveSmsDriver(config) === 'twilio') {
    if (!hasTwilioCredentials(config)) {
      // `SMS_DRIVER=twilio` demandé sans identifiants : on le dit et on
      // retombe sur les logs plutôt que de laisser le constructeur Twilio
      // faire échouer le démarrage de toute l'application.
      logger.warn(
        'SMS_DRIVER=twilio mais identifiants Twilio incomplets — repli sur le driver log.',
      );
      return new LogSmsService(config);
    }

    logger.log('Transport SMS : Twilio (envois réels, facturés).');
    return new TwilioSmsService(config);
  }

  logger.log('Transport SMS : log (aucun SMS ne sort, codes tracés).');
  return new LogSmsService(config);
}

/**
 * Global, single source of truth for SMS_SERVICE across the app (signup OTP,
 * MFA login OTP, dev test endpoint…). Lives in `shared/` because the port is
 * a pure transport contract — a number, a message — carrying no vocabulary
 * from the contexts that call it. @Global() so every feature module gets
 * it without re-importing or re-binding the token locally — module-local
 * SMS_SERVICE bindings should NOT be reintroduced elsewhere, they would
 * silently shadow this one for their own injector scope.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SMS_SERVICE,
      useFactory: smsServiceFactory,
      inject: [ConfigService],
    },
  ],
  exports: [SMS_SERVICE],
})
export class SmsModule {}
