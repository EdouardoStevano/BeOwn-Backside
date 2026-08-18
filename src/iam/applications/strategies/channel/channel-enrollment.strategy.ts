import { Logger } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { OtpService } from 'src/iam/applications/services/otp/otp.service';
import { type UserRepository } from 'src/iam/domains/ports/user.repository';
import {
  InvalidOtpCodeError,
  OtpDeliveryFailedError,
  MfaEnrollmentNotStartedError,
  MfaMethodAlreadyEnrolledError,
  UserNotFoundError,
} from 'src/iam/domains/errors';
import {
  MfaEnrollmentChallenge,
  MfaEnrollmentConfirmation,
  MfaEnrollmentRequest,
  MfaEnrollmentStrategy,
} from '../mfa/mfa-enrollment.strategy';

/**
 * Clé de l'OTP d'enrôlement. Distincte des clés de connexion
 * (`otp:email:<email>`) : un code envoyé pour enrôler un canal ne doit pas
 * pouvoir ouvrir une session, ni l'inverse.
 */
const enrollmentOtpKey = (method: MfaMethodType, userId: number): string =>
  `otp:enroll:${method}:${userId}`;

/**
 * Socle des canaux 2FA dont la preuve est un code envoyé par le serveur —
 * aujourd'hui email et SMS. Leur cycle de vie est rigoureusement le même
 * (purger l'enrôlement en cours → créer la méthode en attente → envoyer le
 * code → confirmer → activer) ; seules la résolution de la destination et la
 * remise du code changent, d'où les deux méthodes abstraites (Template
 * Method).
 */
export abstract class ChannelEnrollmentStrategy implements MfaEnrollmentStrategy {
  abstract readonly method: MfaMethodType;

  protected readonly logger = new Logger(this.constructor.name);

  protected constructor(
    protected readonly otpService: OtpService,
    // Le compte est la racine de l'agrégat : les facteurs se lisent et
    // s'écrivent à travers lui, jamais par un port qui leur serait propre.
    protected readonly userRepository: UserRepository,
  ) {}

  /**
   * Destination du code, validée : adresse email ou numéro E.164. C'est ce que
   * porte `credential` pour ces canaux — le champ unifié du facteur, qui
   * contient le secret chiffré côté TOTP.
   */
  protected abstract resolveCredential(
    request: MfaEnrollmentRequest,
  ): Promise<string>;

  /** Remise effective du code sur le canal. */
  protected abstract deliver(credential: string, otp: string): Promise<void>;

  /** Message rendu à l'appelant si la remise échoue. */
  protected abstract deliveryFailureMessage(): string;

  async start(request: MfaEnrollmentRequest): Promise<MfaEnrollmentChallenge> {
    const credential = await this.resolveCredential(request);
    const { userId } = request;

    const compte = await this.userRepository.findByIdWithFacteurs(userId);
    if (!compte) throw new UserNotFoundError();

    if (compte.protegeDeja(this.method, credential)) {
      // Renvoyer un code sur un canal déjà prouvé relèverait du parcours de
      // connexion, pas de l'enrôlement.
      throw new MfaMethodAlreadyEnrolledError(this.method);
    }

    const key = enrollmentOtpKey(this.method, userId);

    // Pas de garde « un code est déjà actif » : rappeler cette route est le
    // moyen de **redemander un code** quand le premier n'est pas arrivé.
    // Refuser laissait l'utilisateur à la porte de son propre enrôlement le
    // temps du TTL, sans recours. Le nombre d'envois est borné là où c'est son
    // sujet — le quota de requêtes de la route (3/min).
    //
    // Au plus un enrôlement en attente par canal : `enrolerFacteur` purge les
    // tentatives abandonnées, sans quoi la confirmation aurait à deviner
    // laquelle des lignes inactives l'utilisateur est en train de prouver.
    compte.enrolerFacteur(this.method, credential);
    await this.userRepository.update(compte);

    const otp = await this.otpService.generateOtp(key);

    try {
      await this.deliver(credential, otp);
    } catch (err) {
      // Envoi manqué : on invalide l'OTP pour autoriser un retry immédiat,
      // sinon l'utilisateur reste bloqué tout le TTL sans avoir reçu le code.
      await this.otpService.invalidate(key);
      this.logger.error(
        `Échec de l'envoi du code d'enrôlement ${this.method} à ${credential} — OTP invalidé pour autoriser un retry.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new OtpDeliveryFailedError(this.deliveryFailureMessage(), err);
    }

    return { method: this.method, sentTo: credential };
  }

  async hasPending(userId: number): Promise<boolean> {
    const compte = await this.userRepository.findByIdWithFacteurs(userId);
    return compte !== null && compte.facteurEnAttente(this.method) !== null;
  }

  async confirm(confirmation: MfaEnrollmentConfirmation): Promise<void> {
    const { userId, otp } = confirmation;

    const compte = await this.userRepository.findByIdWithFacteurs(userId);
    if (!compte) throw new UserNotFoundError();
    if (!compte.facteurEnAttente(this.method)) {
      throw new MfaEnrollmentNotStartedError(this.method);
    }

    const key = enrollmentOtpKey(this.method, userId);
    if (!(await this.otpService.verifyOtp(key, otp))) {
      throw new InvalidOtpCodeError();
    }

    // Le facteur fraîchement confirmé devient l'unique facteur actif du
    // **compte**, et non de son seul canal : c'est l'invariant que
    // `confirmerFacteur` applique, sans que l'appelant ait à y penser.
    compte.confirmerFacteur(this.method);
    await this.userRepository.update(compte);
  }
}
