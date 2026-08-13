import { Logger } from '@nestjs/common';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import { type OtpStore } from 'src/iam/applications/ports/otp-store.port';
import { type ChannelTfaMethodRepository } from 'src/iam/domains/ports/channel-tfa-method.repository';
import {
  InvalidOtpCodeError,
  OtpAlreadyActiveError,
  OtpDeliveryFailedError,
  TfaEnrollmentNotStartedError,
  TfaMethodAlreadyEnrolledError,
} from 'src/iam/domains/errors';
import {
  TfaEnrollmentChallenge,
  TfaEnrollmentConfirmation,
  TfaEnrollmentRequest,
  TfaEnrollmentStrategy,
} from './tfa-enrollment.strategy';

/**
 * Clé de l'OTP d'enrôlement. Distincte des clés de connexion
 * (`otp:email:<email>`) : un code envoyé pour enrôler un canal ne doit pas
 * pouvoir ouvrir une session, ni l'inverse.
 */
const enrollmentOtpKey = (method: TfaMethodType, userId: number): string =>
  `otp:enroll:${method}:${userId}`;

/**
 * Socle des canaux 2FA dont la preuve est un code envoyé par le serveur —
 * aujourd'hui email et SMS. Leur cycle de vie est rigoureusement le même
 * (purger l'enrôlement en cours → créer la méthode en attente → envoyer le
 * code → confirmer → activer) ; seules la résolution de la destination et la
 * remise du code changent, d'où les deux méthodes abstraites (Template
 * Method).
 */
export abstract class ChannelEnrollmentStrategy implements TfaEnrollmentStrategy {
  abstract readonly method: TfaMethodType;

  protected readonly logger = new Logger(this.constructor.name);

  protected constructor(
    protected readonly otpStore: OtpStore,
    protected readonly methodRepository: ChannelTfaMethodRepository,
  ) {}

  /** Destination du code, validée : adresse email ou numéro E.164. */
  protected abstract resolveTarget(
    request: TfaEnrollmentRequest,
  ): Promise<string>;

  /** Remise effective du code sur le canal. */
  protected abstract deliver(target: string, otp: string): Promise<void>;

  /** Message rendu à l'appelant si la remise échoue. */
  protected abstract deliveryFailureMessage(): string;

  async start(request: TfaEnrollmentRequest): Promise<TfaEnrollmentChallenge> {
    const target = await this.resolveTarget(request);
    const { userId } = request;

    const enrolled = await this.methodRepository.findAllByUserId(userId);
    if (enrolled.some((m) => m.isActive && m.target === target)) {
      // Renvoyer un code sur un canal déjà prouvé relèverait du parcours de
      // connexion, pas de l'enrôlement.
      throw new TfaMethodAlreadyEnrolledError(this.method);
    }

    const key = enrollmentOtpKey(this.method, userId);
    if (await this.otpStore.hasActiveOtp(key)) {
      throw new OtpAlreadyActiveError();
    }

    // Au plus un enrôlement en attente par canal : les tentatives abandonnées
    // sont purgées, sans quoi la confirmation aurait à deviner laquelle des
    // lignes inactives l'utilisateur est en train de prouver.
    await this.methodRepository.deletePendingForUser(userId);
    await this.methodRepository.create(userId, target);

    const otp = await this.otpStore.generateOtp(key);

    try {
      await this.deliver(target, otp);
    } catch (err) {
      // Envoi manqué : on invalide l'OTP pour autoriser un retry immédiat,
      // sinon l'utilisateur reste bloqué tout le TTL sans avoir reçu le code.
      await this.otpStore.invalidate(key);
      this.logger.error(
        `Échec de l'envoi du code d'enrôlement ${this.method} à ${target} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new OtpDeliveryFailedError(this.deliveryFailureMessage(), err);
    }

    return { method: this.method, sentTo: target };
  }

  async hasPending(userId: number): Promise<boolean> {
    const methods = await this.methodRepository.findAllByUserId(userId);
    return methods.some((method) => !method.isActive);
  }

  async confirm(confirmation: TfaEnrollmentConfirmation): Promise<void> {
    const { userId, otp } = confirmation;

    const methods = await this.methodRepository.findAllByUserId(userId);
    const pending = methods.find((method) => !method.isActive);
    if (!pending) {
      throw new TfaEnrollmentNotStartedError(this.method);
    }

    const key = enrollmentOtpKey(this.method, userId);
    if (!(await this.otpStore.verifyOtp(key, otp))) {
      throw new InvalidOtpCodeError();
    }

    // Comme pour TOTP : la méthode fraîchement confirmée devient l'unique
    // méthode active de son canal.
    await this.methodRepository.deactivateAllForUser(userId);
    await this.methodRepository.activate(pending.id);
  }
}
