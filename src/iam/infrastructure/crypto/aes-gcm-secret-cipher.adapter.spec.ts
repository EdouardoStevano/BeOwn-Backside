import { ConfigService } from '@nestjs/config';
import { InvalidTotpSecretError } from 'src/iam/domains/errors';
import { AesGcmSecretCipherAdapter } from './aes-gcm-secret-cipher.adapter';

/**
 * La clé de chiffrement des secrets TOTP retombait silencieusement sur
 * `JWT_SECRET`. Une rotation de ce dernier — geste normal d'exploitation —
 * rendait donc ILLISIBLES tous les seconds facteurs enregistrés, sans le
 * moindre signal. La clé dédiée est désormais exigée, et une fenêtre de
 * compatibilité permet de relire ce qui a été chiffré avec l'ancienne.
 */
describe('AesGcmSecretCipherAdapter', () => {
  const makeConfig = (env: Record<string, string | undefined>) =>
    ({
      get: (cle: string) => env[cle],
      getOrThrow: (cle: string) => {
        const valeur = env[cle];
        if (valeur === undefined) {
          throw new Error(`Configuration ${cle} manquante`);
        }
        return valeur;
      },
    }) as unknown as ConfigService;

  const CLE_ACTIVE = 'a'.repeat(64);
  const CLE_LEGACY = 'b'.repeat(64);

  it('chiffre et déchiffre avec la clé dédiée', () => {
    const cipher = new AesGcmSecretCipherAdapter(
      makeConfig({ MFA_SECRET_ENCRYPTION_KEY: CLE_ACTIVE }),
    );

    const chiffre = cipher.encrypt('SECRET-TOTP');

    expect(chiffre).toMatch(/^enc:v1:/);
    expect(cipher.decrypt(chiffre)).toBe('SECRET-TOTP');
  });

  it('EXIGE la clé dédiée : plus de repli silencieux sur JWT_SECRET', () => {
    const cipher = new AesGcmSecretCipherAdapter(
      makeConfig({ JWT_SECRET: CLE_LEGACY }),
    );

    expect(() => cipher.encrypt('SECRET-TOTP')).toThrow(
      /MFA_SECRET_ENCRYPTION_KEY/,
    );
  });

  it('rend tel quel un secret antérieur au chiffrement', () => {
    const cipher = new AesGcmSecretCipherAdapter(
      makeConfig({ MFA_SECRET_ENCRYPTION_KEY: CLE_ACTIVE }),
    );

    expect(cipher.decrypt('SECRET-EN-CLAIR')).toBe('SECRET-EN-CLAIR');
  });

  describe('fenêtre de compatibilité (MFA_LEGACY_KEY_FALLBACK)', () => {
    /** Secret tel qu'il existe en base : chiffré avec l'ancienne clé. */
    const secretLegacy = () =>
      new AesGcmSecretCipherAdapter(
        makeConfig({ MFA_SECRET_ENCRYPTION_KEY: CLE_LEGACY }),
      ).encrypt('SECRET-TOTP');

    it.each(['TFA_SECRET_ENCRYPTION_KEY', 'JWT_SECRET'])(
      'relit par défaut un secret chiffré avec %s',
      (nomLegacy) => {
        const chiffre = secretLegacy();
        const cipher = new AesGcmSecretCipherAdapter(
          makeConfig({
            MFA_SECRET_ENCRYPTION_KEY: CLE_ACTIVE,
            [nomLegacy]: CLE_LEGACY,
          }),
        );

        expect(cipher.decrypt(chiffre)).toBe('SECRET-TOTP');
      },
    );

    it('la fenêtre fermée refuse le secret legacy', () => {
      const chiffre = secretLegacy();
      const cipher = new AesGcmSecretCipherAdapter(
        makeConfig({
          MFA_SECRET_ENCRYPTION_KEY: CLE_ACTIVE,
          JWT_SECRET: CLE_LEGACY,
          MFA_LEGACY_KEY_FALLBACK: 'false',
        }),
      );

      expect(() => cipher.decrypt(chiffre)).toThrow(InvalidTotpSecretError);
    });

    it("l'ÉCRITURE n'utilise jamais la clé legacy", () => {
      const cipher = new AesGcmSecretCipherAdapter(
        makeConfig({
          MFA_SECRET_ENCRYPTION_KEY: CLE_ACTIVE,
          JWT_SECRET: CLE_LEGACY,
        }),
      );
      const chiffre = cipher.encrypt('SECRET-TOTP');

      // Relu avec la SEULE clé active : c'est bien elle qui a chiffré.
      const lecteurActif = new AesGcmSecretCipherAdapter(
        makeConfig({
          MFA_SECRET_ENCRYPTION_KEY: CLE_ACTIVE,
          MFA_LEGACY_KEY_FALLBACK: 'false',
        }),
      );
      expect(lecteurActif.decrypt(chiffre)).toBe('SECRET-TOTP');
    });

    it('un secret illisible avec toutes les clés lève une erreur de domaine', () => {
      const chiffre = new AesGcmSecretCipherAdapter(
        makeConfig({ MFA_SECRET_ENCRYPTION_KEY: 'c'.repeat(64) }),
      ).encrypt('SECRET-TOTP');
      const cipher = new AesGcmSecretCipherAdapter(
        makeConfig({
          MFA_SECRET_ENCRYPTION_KEY: CLE_ACTIVE,
          JWT_SECRET: CLE_LEGACY,
        }),
      );

      expect(() => cipher.decrypt(chiffre)).toThrow(InvalidTotpSecretError);
    });

    it('un format tronqué lève une erreur de domaine', () => {
      const cipher = new AesGcmSecretCipherAdapter(
        makeConfig({ MFA_SECRET_ENCRYPTION_KEY: CLE_ACTIVE }),
      );

      expect(() => cipher.decrypt('enc:v1:seulement-un-champ')).toThrow(
        InvalidTotpSecretError,
      );
    });
  });
});
