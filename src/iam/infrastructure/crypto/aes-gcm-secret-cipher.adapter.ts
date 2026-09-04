import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { SecretCipher } from 'src/iam/applications/ports/secret-cipher.port';
import { InvalidTotpSecretError } from 'src/iam/domains/errors';

const ENCRYPTION_PREFIX = 'enc:v1';

/**
 * Anciens noms de variable ayant pu servir à chiffrer les secrets TOTP déjà en
 * base, dans l'ordre où le code les consultait. `JWT_SECRET` en fait partie :
 * c'était le dernier repli.
 */
const CLES_LEGACY = ['TFA_SECRET_ENCRYPTION_KEY', 'JWT_SECRET'] as const;

/**
 * AES-256-GCM avec IV aléatoire par secret. Format sérialisé :
 * `enc:v1:<iv b64>:<tag b64>:<ciphertext b64>`. Le préfixe versionné permet de
 * relire les secrets stockés en clair avant l'introduction du chiffrement
 * (cf. `decrypt`) et d'introduire un futur `enc:v2` sans migration bloquante.
 *
 * CLÉ DÉDIÉE, SANS REPLI À L'ÉCRITURE. `MFA_SECRET_ENCRYPTION_KEY` est
 * désormais EXIGÉE : la chaîne de replis précédente retombait silencieusement
 * sur `JWT_SECRET`, si bien qu'une rotation de ce dernier — geste normal
 * d'exploitation — rendait ILLISIBLES tous les secrets TOTP de la base, donc
 * inutilisables tous les seconds facteurs, sans le moindre signal au
 * démarrage. Un secret de session et une clé de chiffrement au repos n'ont ni
 * le même cycle de vie ni les mêmes conséquences en cas de perte.
 *
 * COMPATIBILITÉ (`MFA_LEGACY_KEY_FALLBACK`, `true` par défaut) : les secrets
 * DÉJÀ chiffrés l'ont été avec l'ancienne clé. La LECTURE tente donc, après
 * échec avec la clé active, les anciennes clés encore présentes dans
 * l'environnement. L'ÉCRITURE, elle, n'utilise jamais qu'`MFA_SECRET_ENCRYPTION_KEY`.
 *
 * Pas de re-chiffrement opportuniste : le port `SecretCipher` ne connaît aucun
 * dépôt et ne peut rien persister — l'ajouter demanderait d'élargir le
 * contrat et de faire écrire le vérificateur de code, sur le chemin critique
 * de la connexion. La rotation se fait donc naturellement au ré-enrôlement du
 * facteur. SUIVI : une commande de rotation hors ligne, après quoi
 * `MFA_LEGACY_KEY_FALLBACK=false` ferme définitivement la lecture legacy.
 */
@Injectable()
export class AesGcmSecretCipherAdapter implements SecretCipher {
  constructor(private readonly configService: ConfigService) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.cleActive(), iv);
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

    // La clé active d'abord, puis les anciennes tant que la fenêtre de
    // compatibilité est ouverte. Un tag GCM invalide fait échouer `final()` :
    // c'est ce qui distingue « chiffré avec une autre clé » de « altéré », et
    // l'échec sur TOUTES les clés vaut secret illisible.
    for (const cle of this.clesDeLecture()) {
      try {
        const decipher = createDecipheriv(
          'aes-256-gcm',
          cle,
          Buffer.from(ivRaw, 'base64'),
        );
        decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
        return Buffer.concat([
          decipher.update(Buffer.from(encryptedRaw, 'base64')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        // Clé suivante.
      }
    }

    throw new InvalidTotpSecretError();
  }

  /** Clé d'ÉCRITURE — exigée, sans repli. */
  private cleActive(): Buffer {
    return this.deriver(
      this.configService.getOrThrow<string>('MFA_SECRET_ENCRYPTION_KEY'),
    );
  }

  /** Clé active, suivie des anciennes si la compatibilité est ouverte. */
  private clesDeLecture(): Buffer[] {
    const cles = [this.cleActive()];
    if (!this.compatibiliteLegacyOuverte()) return cles;

    for (const nom of CLES_LEGACY) {
      const valeur = this.configService.get<string>(nom);
      if (valeur) cles.push(this.deriver(valeur));
    }
    return cles;
  }

  /** `true` par défaut : le fermer suppose la rotation des secrets déjà en base. */
  private compatibiliteLegacyOuverte(): boolean {
    return (
      (this.configService.get<string>('MFA_LEGACY_KEY_FALLBACK') ?? 'true') !==
      'false'
    );
  }

  /** Une clé hexadécimale de 32 octets est prise telle quelle ; sinon, dérivée. */
  private deriver(secret: string): Buffer {
    if (/^[a-f0-9]{64}$/i.test(secret)) {
      return Buffer.from(secret, 'hex');
    }
    return createHash('sha256').update(secret).digest();
  }
}
