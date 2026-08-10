import { Inject, Injectable } from '@nestjs/common';
import {
  TOTP_GENERATOR,
  type TotpGenerator,
  type TotpSecret,
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

/**
 * Enrôlement et vérification TOTP. Pure orchestration : la persistance passe
 * par `TotpMethodRepository`, le chiffrement du secret par `SecretCipher` et
 * le calcul RFC 6238 par `TotpGenerator` — le use case ne connaît ni TypeORM,
 * ni `crypto`, ni otplib.
 */
@Injectable()
export class CreateTotpUseCase {
  constructor(
    @Inject(TOTP_GENERATOR) private readonly totpGenerator: TotpGenerator,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOTP_METHOD_REPOSITORY)
    private readonly totpMethodRepository: TotpMethodRepository,
    @Inject(SECRET_CIPHER) private readonly secretCipher: SecretCipher,
  ) {}

  async setup(userId: number, email: string): Promise<TotpSecret> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new UserNotFoundError();

    const payload = this.totpGenerator.generateSecret(email);
    await this.totpMethodRepository.create(
      userId,
      this.secretCipher.encrypt(payload.secret),
    );

    return payload;
  }

  async verify(userId: number, otp: string): Promise<boolean> {
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

    return true;
  }
}
