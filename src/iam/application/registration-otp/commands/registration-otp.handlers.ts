import { Inject, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { type ConfigType } from '@nestjs/config';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from 'src/iam/domain/ports/account.gateway';
import {
  PHONE_DIRECTORY,
  type PhoneDirectory,
} from 'src/iam/domain/ports/phone.directory';
import {
  REGISTRATION_OTP_STORE,
  RegistrationOtpVerdict,
  type RegistrationOtpStore,
} from 'src/iam/domain/ports/registration-otp.store';
import {
  TOKEN_SERVICE,
  type AuthTokens,
  type TokenService,
} from 'src/iam/domain/ports/token.service';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import { SMS_SERVICE, type SmsService } from 'src/common/sms/sms.service';
import {
  InvalidOtpError,
  PhoneNumberRequiredError,
  TooManyOtpAttemptsError,
} from 'src/iam/domain/errors/iam.errors';
import registrationOtpConfig from 'src/iam/infrastructure/config/registration-otp.config';
import {
  RegistrationOtpChannel,
  ResendRegistrationOtpCommand,
  SendRegistrationOtpCommand,
  VerifyRegistrationOtpCommand,
} from './registration-otp.commands';

/**
 * Message volontairement identique que l'adresse soit inconnue ou le code faux :
 * cet endpoint ne doit pas permettre de savoir si un compte existe.
 */
const INVALID_OR_EXPIRED = 'Code invalide ou expiré';

@CommandHandler(SendRegistrationOtpCommand)
export class SendRegistrationOtpHandler implements ICommandHandler<SendRegistrationOtpCommand> {
  constructor(
    @Inject(REGISTRATION_OTP_STORE)
    private readonly store: RegistrationOtpStore,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
    @Inject(PHONE_DIRECTORY) private readonly phones: PhoneDirectory,
    @Inject(registrationOtpConfig.KEY)
    private readonly config: ConfigType<typeof registrationOtpConfig>,
  ) {}

  async execute(command: SendRegistrationOtpCommand): Promise<void> {
    const phone =
      command.channel === 'sms'
        ? await this.phones.findPhone(command.accountId)
        : null;

    if (command.channel === 'sms' && !phone) {
      throw new PhoneNumberRequiredError();
    }

    const code = await this.store.issue(command.email);

    try {
      await this.deliver(command.email, code, command.channel, phone);
    } catch (err) {
      // Sans invalidation, l'utilisateur resterait bloqué tout le TTL avec un
      // code qu'il n'a jamais reçu. Même règle que pour l'OTP de second facteur.
      await this.store.invalidate(command.email);
      throw err;
    }
  }

  private async deliver(
    email: string,
    code: string,
    channel: RegistrationOtpChannel,
    phone: string | null,
  ): Promise<void> {
    const validite = `${Math.round(this.config.ttlSeconds / 60)} minutes`;

    if (channel === 'sms' && phone) {
      await this.smsService.sendTransactional(
        phone,
        `[BeOwn] Votre code de vérification d'inscription : ${code}. Valide ${validite}.`,
      );
      return;
    }

    await this.emailService.sendOtpEmail(email, code, validite);
  }
}

/**
 * POST /auth/resend-otp — se termine toujours en succès (204), que l'adresse
 * soit inconnue, déjà vérifiée, sous anti-rejeu, ou que l'envoi ait échoué :
 * seuls les logs savent quelle branche a joué. Même contrat anti-énumération
 * que l'envoi du lien de vérification.
 *
 * Une exception assumée : demander le canal SMS sur un compte existant et non
 * vérifié qui n'a pas de numéro renvoie un 400. C'est un canal d'énumération
 * étroit, préféré au fait d'ignorer silencieusement un choix explicite que
 * l'utilisateur attend.
 */
@CommandHandler(ResendRegistrationOtpCommand)
export class ResendRegistrationOtpHandler implements ICommandHandler<ResendRegistrationOtpCommand> {
  private readonly logger = new Logger(ResendRegistrationOtpHandler.name);

  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(REGISTRATION_OTP_STORE)
    private readonly store: RegistrationOtpStore,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: ResendRegistrationOtpCommand): Promise<void> {
    const account = await this.accounts.findByEmail(command.email);
    if (!account) {
      this.logger.log(`resend-otp : adresse inconnue (${command.email})`);
      return;
    }

    if (account.emailVerified) {
      this.logger.log(`resend-otp : adresse déjà vérifiée (${command.email})`);
      return;
    }

    if (await this.store.isResendThrottled(account.email)) {
      this.logger.log(`resend-otp : renvoi trop rapproché (${command.email})`);
      return;
    }

    try {
      await this.commandBus.execute(
        new SendRegistrationOtpCommand(
          account.accountId,
          account.email,
          command.channel,
        ),
      );
    } catch (err) {
      // Le numéro manquant est le seul échec qu'on laisse remonter (cf. docblock).
      if (err instanceof PhoneNumberRequiredError) throw err;

      this.logger.error(
        `Échec du renvoi du code d'inscription à ${command.email} via ${command.channel}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}

/**
 * POST /auth/verify-otp — valide le code, fait passer le compte de « créé » à
 * « email vérifié », et rend des tokens de session de la même forme qu'un
 * sign-in réussi.
 */
@CommandHandler(VerifyRegistrationOtpCommand)
export class VerifyRegistrationOtpHandler implements ICommandHandler<VerifyRegistrationOtpCommand> {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accounts: AccountGateway,
    @Inject(REGISTRATION_OTP_STORE)
    private readonly store: RegistrationOtpStore,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
  ) {}

  async execute(command: VerifyRegistrationOtpCommand): Promise<AuthTokens> {
    const account = await this.accounts.findByEmail(command.email);
    if (!account) throw new InvalidOtpError(INVALID_OR_EXPIRED);

    const verdict = await this.store.verify(account.email, command.code);
    if (verdict === RegistrationOtpVerdict.TOO_MANY_ATTEMPTS) {
      throw new TooManyOtpAttemptsError();
    }
    if (verdict !== RegistrationOtpVerdict.OK) {
      throw new InvalidOtpError(INVALID_OR_EXPIRED);
    }

    // Un compte sanctionné pendant qu'il était encore en attente de
    // vérification ne repart pas avec des tokens : la sanction prime sur la
    // preuve de possession de l'adresse.
    account.ensureNotSanctioned();

    await this.accounts.markEmailAsVerified(account.email);

    return this.tokenService.generateTokens({
      sub: account.accountId,
      email: account.email,
      role: account.role,
    });
  }
}

export const RegistrationOtpHandlers = [
  SendRegistrationOtpHandler,
  ResendRegistrationOtpHandler,
  VerifyRegistrationOtpHandler,
];
