import { Inject, Injectable } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import {
  TOTP_GENERATOR,
  type TotpGenerator,
} from 'src/iam/applications/ports/totp-generator.port';
import {
  MFA_METHOD_REPOSITORY,
  type MfaMethodRepository,
} from 'src/iam/domains/ports/mfa-method.repository';
import {
  SECRET_CIPHER,
  type SecretCipher,
} from 'src/iam/applications/ports/secret-cipher.port';
import {
  MfaChallengeEmission,
  MfaChallengeStrategy,
  MfaMethodSummary,
} from '../mfa/mfa-challenge.strategy';

/**
 * Vérification du facteur TOTP.
 *
 * Seul canal dont l'émission du défi ne fait rien : le code est calculé par
 * l'application de l'utilisateur à partir du secret partagé, le serveur n'a
 * rien à envoyer. C'est précisément ce que le contrat rend possible sans que
 * les use cases aient à connaître la particularité (§4 — LSP).
 */
@Injectable()
export class TotpChallengeStrategy implements MfaChallengeStrategy {
  readonly method = MfaMethodType.TOTP;

  constructor(
    @Inject(TOTP_GENERATOR) private readonly totpGenerator: TotpGenerator,
    @Inject(MFA_METHOD_REPOSITORY)
    private readonly mfaMethodRepository: MfaMethodRepository,
    @Inject(SECRET_CIPHER) private readonly secretCipher: SecretCipher,
  ) {}

  async isActiveFor(userId: number): Promise<boolean> {
    const methods = await this.mfaMethodRepository.findAllByUserId(
      userId,
      this.method,
    );
    return methods.some((factor) => factor.isActive());
  }

  /** Rien à transmettre : le code vit dans l'application de l'utilisateur. */
  issue(): Promise<MfaChallengeEmission> {
    return Promise.resolve({});
  }

  async describeFor(userId: number): Promise<MfaMethodSummary[]> {
    const methods = await this.mfaMethodRepository.findAllByUserId(
      userId,
      this.method,
    );

    // Aucun `sentTo` : il n'y a pas de destination à montrer, et surtout le
    // `credential` de ce canal est le secret partagé — même chiffré, même
    // tronqué, il n'a rien à faire dans une réponse HTTP.
    return methods.map((entry) => ({
      method: this.method,
      isActive: entry.isActive(),
    }));
  }

  async verify(userId: number, code: string): Promise<boolean> {
    const methods = await this.mfaMethodRepository.findAllByUserId(
      userId,
      this.method,
    );

    // Seules les méthodes actives sont éprouvées : un secret enrôlé mais jamais
    // confirmé ne doit pas pouvoir ouvrir de session, sans quoi afficher un QR
    // code suffirait à contourner le facteur en place.
    for (const factor of methods.filter((m) => m.isActive())) {
      const secret = this.secretCipher.decrypt(factor.encryptedSecret);
      if (await this.totpGenerator.verify(code, secret)) return true;
    }

    return false;
  }

  async deactivate(userId: number): Promise<void> {
    await this.mfaMethodRepository.deactivateChannel(userId, this.method);
  }
}
