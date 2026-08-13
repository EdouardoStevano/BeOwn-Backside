import { Inject, Injectable } from '@nestjs/common';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import {
  TOTP_GENERATOR,
  type TotpGenerator,
} from 'src/iam/applications/ports/totp-generator.port';
import {
  TOTP_METHOD_REPOSITORY,
  type TotpMethodRepository,
} from 'src/iam/domains/ports/totp-method.repository';
import {
  SECRET_CIPHER,
  type SecretCipher,
} from 'src/iam/applications/ports/secret-cipher.port';
import {
  TfaChallengeEmission,
  TfaChallengeStrategy,
} from './tfa-challenge.strategy';

/**
 * Vérification du facteur TOTP.
 *
 * Seul canal dont l'émission du défi ne fait rien : le code est calculé par
 * l'application de l'utilisateur à partir du secret partagé, le serveur n'a
 * rien à envoyer. C'est précisément ce que le contrat rend possible sans que
 * les use cases aient à connaître la particularité (§4 — LSP).
 */
@Injectable()
export class TotpChallengeStrategy implements TfaChallengeStrategy {
  readonly method = TfaMethodType.TOTP;

  constructor(
    @Inject(TOTP_GENERATOR) private readonly totpGenerator: TotpGenerator,
    @Inject(TOTP_METHOD_REPOSITORY)
    private readonly totpMethodRepository: TotpMethodRepository,
    @Inject(SECRET_CIPHER) private readonly secretCipher: SecretCipher,
  ) {}

  async isActiveFor(userId: number): Promise<boolean> {
    const methods = await this.totpMethodRepository.findAllByUserId(userId);
    return methods.some((method) => method.isActive);
  }

  /** Rien à transmettre : le code vit dans l'application de l'utilisateur. */
  issue(): Promise<TfaChallengeEmission> {
    return Promise.resolve({});
  }

  async verify(userId: number, code: string): Promise<boolean> {
    const methods = await this.totpMethodRepository.findAllByUserId(userId);

    // Seules les méthodes actives sont éprouvées : un secret enrôlé mais jamais
    // confirmé ne doit pas pouvoir ouvrir de session, sans quoi afficher un QR
    // code suffirait à contourner le facteur en place.
    for (const method of methods.filter((m) => m.isActive)) {
      const secret = this.secretCipher.decrypt(method.encryptedSecret);
      if (await this.totpGenerator.verify(code, secret)) return true;
    }

    return false;
  }

  async deactivate(userId: number): Promise<void> {
    await this.totpMethodRepository.deactivateAllForUser(userId);
  }
}
