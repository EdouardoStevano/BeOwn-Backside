import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { SecretCipher } from 'src/iam/application/ports/secret-cipher.port';
import { InvalidTotpSecretError } from 'src/iam/domain/errors';

const ENCRYPTION_PREFIX = 'enc:v1';

/**
 * AES-256-GCM avec IV aléatoire par secret. Format sérialisé :
 * `enc:v1:<iv b64>:<tag b64>:<ciphertext b64>`. Le préfixe versionné permet de
 * relire les secrets stockés en clair avant l'introduction du chiffrement
 * (cf. `decrypt`) et d'introduire un futur `enc:v2` sans migration bloquante.
 */
@Injectable()
export class AesGcmSecretCipherAdapter implements SecretCipher {
  constructor(private readonly configService: ConfigService) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      ENCRYPTION_PREFIX,
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(ciphertext: string): string {
    // Secret antérieur au chiffrement : rendu tel quel.
    if (!ciphertext.startsWith(`${ENCRYPTION_PREFIX}:`)) return ciphertext;

    const [, , ivRaw, tagRaw, encryptedRaw] = ciphertext.split(':');
    if (!ivRaw || !tagRaw || !encryptedRaw) {
      throw new InvalidTotpSecretError();
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(ivRaw, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private getEncryptionKey(): Buffer {
    const secret =
      this.configService.get<string>('MFA_SECRET_ENCRYPTION_KEY') ??
      // Ancien nom, toujours lu : c'est une variable d'environnement, donc un
      // contrat de déploiement. Un renommage sec ferait basculer la clé sur
      // `JWT_SECRET` au prochain démarrage et rendrait **illisibles** tous les
      // secrets TOTP déjà chiffrés. À retirer une fois les environnements
      // passés à `MFA_SECRET_ENCRYPTION_KEY`.
      this.configService.get<string>('TFA_SECRET_ENCRYPTION_KEY') ??
      this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error(
        'MFA_SECRET_ENCRYPTION_KEY or JWT_SECRET must be configured',
      );
    }

    if (/^[a-f0-9]{64}$/i.test(secret)) {
      return Buffer.from(secret, 'hex');
    }

    return createHash('sha256').update(secret).digest();
  }
}
