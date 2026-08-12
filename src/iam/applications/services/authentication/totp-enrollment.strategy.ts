import { Inject, Injectable } from '@nestjs/common';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import {
  TOTP_GENERATOR,
  type TotpGenerator,
} from 'src/iam/domains/ports/totp-generator.port';
import {
  TOTP_METHOD_REPOSITORY,
  type TotpMethodRepository,
} from 'src/iam/domains/ports/totp-method.repository';
import {
  SECRET_CIPHER,
  type SecretCipher,
} from 'src/iam/domains/ports/secret-cipher.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  InvalidTotpCodeError,
  TotpNotConfiguredError,
  UserNotFoundError,
} from 'src/iam/domains/errors';
import {
  TfaEnrollmentChallenge,
  TfaEnrollmentConfirmation,
  TfaEnrollmentRequest,
  TfaEnrollmentStrategy,
} from './tfa-enrollment.strategy';

/**
 * Enrôlement TOTP (Google Authenticator & co).
 *
 * Reprend à l'identique la logique de l'ancien `CreateTotpUseCase` : la
 * persistance passe par `TotpMethodRepository`, le chiffrement du secret par
 * `SecretCipher` et le calcul RFC 6238 par `TotpGenerator` — cette classe ne
 * connaît ni TypeORM, ni `crypto`, ni otplib.
 */
@Injectable()
export class TotpEnrollmentStrategy implements TfaEnrollmentStrategy {
  readonly method = TfaMethodType.TOTP;

  constructor(
    @Inject(TOTP_GENERATOR) private readonly totpGenerator: TotpGenerator,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOTP_METHOD_REPOSITORY)
    private readonly totpMethodRepository: TotpMethodRepository,
    @Inject(SECRET_CIPHER) private readonly secretCipher: SecretCipher,
  ) {}

  async start(request: TfaEnrollmentRequest): Promise<TfaEnrollmentChallenge> {
    const user = await this.userRepository.findById(request.userId);
    if (!user) throw new UserNotFoundError();

    const payload = this.totpGenerator.generateSecret(
      user.email || request.email,
    );

    // Au plus un secret en attente, comme sur les canaux email/SMS : un QR code
    // affiché puis abandonné ne doit pas rester enrôlable. Les méthodes déjà
    // actives ne sont pas touchées — l'ancien authenticator continue de servir
    // tant que le nouveau n'est pas confirmé.
    await this.totpMethodRepository.deletePendingForUser(request.userId);

    await this.totpMethodRepository.create(
      request.userId,
      this.secretCipher.encrypt(payload.secret),
    );

    return { method: this.method, secret: payload.secret, uri: payload.uri };
  }

  async confirm(confirmation: TfaEnrollmentConfirmation): Promise<void> {
    const { userId, otp } = confirmation;

    const user = await this.userRepository.findById(userId);
    if (!user) throw new UserNotFoundError();

    const methods = await this.totpMethodRepository.findAllByUserId(userId);
    if (methods.length === 0) {
      throw new TotpNotConfiguredError();
    }

    let validMethod: (typeof methods)[number] | null = null;
    for (const method of methods) {
      const secret = this.secretCipher.decrypt(method.encryptedSecret);
      if (await this.totpGenerator.verify(otp, secret)) {
        validMethod = method;
        break;
      }
    }

    if (!validMethod) {
      throw new InvalidTotpCodeError();
    }

    // Première vérification réussie d'une méthode fraîchement enrôlée : elle
    // devient l'unique méthode active du compte.
    if (!validMethod.isActive) {
      await this.totpMethodRepository.deactivateAllForUser(userId);
      await this.totpMethodRepository.activate(validMethod.id);
    }
  }
}
