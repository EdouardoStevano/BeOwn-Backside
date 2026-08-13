import { Logger } from '@nestjs/common';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import { type OtpStore } from 'src/iam/applications/ports/otp-store.port';
import { type ChannelTfaMethodRepository } from 'src/iam/domains/ports/channel-tfa-method.repository';
import {
  NoActiveMfaMethodError,
  OtpDeliveryFailedError,
} from 'src/iam/domains/errors';
import {
  TfaChallengeEmission,
  TfaChallengeStrategy,
} from './tfa-challenge.strategy';

/**
 * Clé de l'OTP de vérification. Distincte de celle de l'enrôlement
 * (`otp:enroll:<method>:<userId>`) comme des OTP de connexion par adresse
 * (`otp:email:<email>`) : un code émis pour prouver un facteur déjà actif ne
 * doit ni confirmer un enrôlement, ni l'inverse.
 */
const challengeOtpKey = (method: TfaMethodType, userId: number): string =>
  `otp:mfa:${method}:${userId}`;

/**
 * Socle des canaux dont la preuve est un code envoyé par le serveur (email,
 * SMS), côté vérification.
 *
 * Le pendant de `ChannelEnrollmentStrategy`, à une différence près qui explique
 * pourquoi les deux ne fusionnent pas : ici la méthode est **déjà active**, on
 * lit sa destination en base au lieu de la recevoir de l'appelant. Personne ne
 * choisit où part le code d'un facteur déjà enrôlé.
 */
export abstract class ChannelChallengeStrategy implements TfaChallengeStrategy {
  abstract readonly method: TfaMethodType;

  protected readonly logger = new Logger(this.constructor.name);

  protected constructor(
    protected readonly otpStore: OtpStore,
    protected readonly methodRepository: ChannelTfaMethodRepository,
  ) {}

  /** Remise effective du code sur le canal. */
  protected abstract deliver(target: string, otp: string): Promise<void>;

  /** Message rendu à l'appelant si la remise échoue. */
  protected abstract deliveryFailureMessage(): string;

  async isActiveFor(userId: number): Promise<boolean> {
    return (await this.activeTarget(userId)) !== null;
  }

  async issue(userId: number): Promise<TfaChallengeEmission> {
    const target = await this.activeTarget(userId);
    if (!target) throw new NoActiveMfaMethodError();

    const key = challengeOtpKey(this.method, userId);

    // Pas de garde `hasActiveOtp` ici, contrairement à l'enrôlement : réémettre
    // écrase simplement le code précédent. Refuser bloquerait tout le TTL
    // quelqu'un qui n'a pas reçu son SMS, et le laisserait à la porte de son
    // propre compte — un enrôlement abandonné, lui, n'empêche pas de se
    // connecter.
    const otp = await this.otpStore.generateOtp(key);

    try {
      await this.deliver(target, otp);
    } catch (err) {
      await this.otpStore.invalidate(key);
      this.logger.error(
        `Échec de l'envoi du code de vérification ${this.method} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new OtpDeliveryFailedError(this.deliveryFailureMessage(), err);
    }

    return { sentTo: this.mask(target) };
  }

  async verify(userId: number, code: string): Promise<boolean> {
    if (!(await this.isActiveFor(userId))) return false;
    return this.otpStore.verifyOtp(challengeOtpKey(this.method, userId), code);
  }

  async deactivate(userId: number): Promise<void> {
    await this.methodRepository.deactivateAllForUser(userId);
    // Le code en vol devient sans objet : le laisser vivre permettrait de
    // prouver un facteur qui n'existe plus.
    await this.otpStore.invalidate(challengeOtpKey(this.method, userId));
  }

  /** Destination du canal si — et seulement si — il est actif. */
  private async activeTarget(userId: number): Promise<string | null> {
    const methods = await this.methodRepository.findAllByUserId(userId);
    return methods.find((method) => method.isActive)?.target ?? null;
  }

  /**
   * La destination est renvoyée tronquée : elle doit permettre à son titulaire
   * de reconnaître où le code est parti, sans révéler l'adresse ou le numéro
   * complet à qui présente seulement un mot de passe.
   */
  protected abstract mask(target: string): string;
}
