import { Logger } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { OtpService } from 'src/iam/applications/services/otp/otp.service';
import { type MfaMethodRepository } from 'src/iam/domains/ports/mfa-method.repository';
import { MfaMethod } from 'src/iam/domains/models/mfa-method';
import {
  NoActiveMfaMethodError,
  OtpDeliveryFailedError,
} from 'src/iam/domains/errors';
import {
  MfaChallengeEmission,
  MfaChallengeStrategy,
  MfaMethodSummary,
} from '../mfa/mfa-challenge.strategy';

/**
 * Clé de l'OTP de vérification. Distincte de celle de l'enrôlement
 * (`otp:enroll:<method>:<userId>`) comme des OTP de connexion par adresse
 * (`otp:email:<email>`) : un code émis pour prouver un facteur déjà actif ne
 * doit ni confirmer un enrôlement, ni l'inverse.
 */
const challengeOtpKey = (method: MfaMethodType, userId: number): string =>
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
export abstract class ChannelChallengeStrategy implements MfaChallengeStrategy {
  abstract readonly method: MfaMethodType;

  protected readonly logger = new Logger(this.constructor.name);

  protected constructor(
    protected readonly otpService: OtpService,
    protected readonly methodRepository: MfaMethodRepository,
  ) {}

  /** Remise effective du code sur le canal. */
  protected abstract deliver(credential: string, otp: string): Promise<void>;

  /** Message rendu à l'appelant si la remise échoue. */
  protected abstract deliveryFailureMessage(): string;

  async isActiveFor(userId: number): Promise<boolean> {
    return (await this.activeMethod(userId)) !== null;
  }

  async describeFor(userId: number): Promise<MfaMethodSummary[]> {
    const methods = await this.methodRepository.findAllByUserId(
      userId,
      this.method,
    );

    return methods.map((entry) => ({
      method: this.method,
      isActive: entry.isActive(),
      // Masquée, comme à l'émission du défi : cette liste sert à reconnaître
      // ses propres facteurs, pas à relire l'adresse ou le numéro en clair.
      sentTo: entry.maskedDestination(),
    }));
  }

  async issue(userId: number): Promise<MfaChallengeEmission> {
    const factor = await this.activeMethod(userId);
    if (!factor) throw new NoActiveMfaMethodError();

    const key = challengeOtpKey(this.method, userId);

    // Pas de garde `hasActiveOtp` ici, contrairement à l'enrôlement : réémettre
    // écrase simplement le code précédent. Refuser bloquerait tout le TTL
    // quelqu'un qui n'a pas reçu son SMS, et le laisserait à la porte de son
    // propre compte — un enrôlement abandonné, lui, n'empêche pas de se
    // connecter.
    const otp = await this.otpService.generateOtp(key);

    try {
      await this.deliver(factor.destination, otp);
    } catch (err) {
      await this.otpService.invalidate(key);
      this.logger.error(
        `Échec de l'envoi du code de vérification ${this.method} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new OtpDeliveryFailedError(this.deliveryFailureMessage(), err);
    }

    return { sentTo: factor.maskedDestination() };
  }

  async verify(userId: number, code: string): Promise<boolean> {
    if (!(await this.isActiveFor(userId))) return false;
    return this.otpService.verifyOtp(
      challengeOtpKey(this.method, userId),
      code,
    );
  }

  async deactivate(userId: number): Promise<void> {
    // Portée volontairement limitée au canal, contrairement à l'activation :
    // retirer un facteur ne doit toucher que celui qu'on retire. Comme le
    // compte n'en a qu'un actif à la fois, cela revient au même aujourd'hui —
    // mais dire « désactive tout » ici serait exact par accident.
    await this.methodRepository.deactivateChannel(userId, this.method);
    // Le code en vol devient sans objet : le laisser vivre permettrait de
    // prouver un facteur qui n'existe plus.
    await this.otpService.invalidate(challengeOtpKey(this.method, userId));
  }

  /** Facteur actif du canal, s'il y en a un. */
  private async activeMethod(userId: number): Promise<MfaMethod | null> {
    const methods = await this.methodRepository.findAllByUserId(
      userId,
      this.method,
    );
    return methods.find((factor) => factor.isActive()) ?? null;
  }
}
