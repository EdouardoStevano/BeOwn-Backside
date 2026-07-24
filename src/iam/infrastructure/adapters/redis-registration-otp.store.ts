import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { type ConfigType } from '@nestjs/config';
import { randomInt } from 'crypto';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import {
  RegistrationOtpStore,
  RegistrationOtpVerdict,
} from 'src/iam/domain/ports/registration-otp.store';
import registrationOtpConfig from '../config/registration-otp.config';

interface RegistrationOtpRecord {
  /** Empreinte du code à 6 chiffres — jamais le code lui-même. */
  codeHash: string;
  attempts: number;
  /**
   * Epoch ms. Suivi dans l'enregistrement lui-même, et pas seulement via le TTL
   * Redis : réécrire l'enregistrement après une tentative ratée prolongerait
   * sinon silencieusement la validité du code.
   */
  expiresAt: number;
}

/**
 * Implémentation Redis du port. Deux précautions qui expliquent le code :
 *
 * - la clé est préfixée `registration-otp-`, sans collision possible avec les
 *   codes 2FA (`otp:email:*`) ni les jetons de lien (`email-token-*`), même
 *   pour la même adresse ;
 * - le code est haché avant d'atteindre Redis : une fuite de sauvegarde ou une
 *   ACL mal configurée ne distribue pas des codes utilisables.
 */
@Injectable()
export class RedisRegistrationOtpStore implements RegistrationOtpStore {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    @Inject(registrationOtpConfig.KEY)
    private readonly config: ConfigType<typeof registrationOtpConfig>,
  ) {}

  async issue(email: string): Promise<string> {
    // randomInt (CSPRNG) et non Math.random : un code prédictible se devine
    // sans jamais accéder à la boîte mail de la victime.
    const code = randomInt(100_000, 1_000_000).toString();
    const record: RegistrationOtpRecord = {
      codeHash: await this.hashingService.hash(code),
      attempts: 0,
      expiresAt: Date.now() + this.config.ttlSeconds * 1000,
    };

    await this.cache.set(
      this.codeKey(email),
      record,
      this.config.ttlSeconds * 1000,
    );
    await this.cache.set(
      this.resendKey(email),
      Date.now(),
      this.config.resendCooldownSeconds * 1000,
    );

    return code;
  }

  async verify(email: string, code: string): Promise<RegistrationOtpVerdict> {
    const key = this.codeKey(email);
    const record = await this.cache.get<RegistrationOtpRecord>(key);
    if (!record) return RegistrationOtpVerdict.EXPIRED;

    if (record.expiresAt <= Date.now()) {
      await this.cache.del(key);
      return RegistrationOtpVerdict.EXPIRED;
    }

    if (record.attempts >= this.config.maxAttempts) {
      await this.cache.del(key);
      return RegistrationOtpVerdict.TOO_MANY_ATTEMPTS;
    }

    if (!(await this.hashingService.compare(code, record.codeHash))) {
      const attempts = record.attempts + 1;
      if (attempts >= this.config.maxAttempts) {
        await this.cache.del(key);
        return RegistrationOtpVerdict.TOO_MANY_ATTEMPTS;
      }
      // TTL restant, pas un TTL neuf : cf. le commentaire sur `expiresAt`.
      await this.cache.set(
        key,
        { ...record, attempts },
        record.expiresAt - Date.now(),
      );
      return RegistrationOtpVerdict.INVALID;
    }

    // Usage unique : le code est consommé dès la première vérification réussie.
    await this.cache.del(key);
    return RegistrationOtpVerdict.OK;
  }

  async invalidate(email: string): Promise<void> {
    await Promise.all([
      this.cache.del(this.codeKey(email)),
      this.cache.del(this.resendKey(email)),
    ]);
  }

  async isResendThrottled(email: string): Promise<boolean> {
    return !!(await this.cache.get(this.resendKey(email)));
  }

  private normalize(email: string): string {
    return email.toLowerCase().trim();
  }

  private codeKey(email: string): string {
    return `registration-otp-${this.normalize(email)}`;
  }

  private resendKey(email: string): string {
    return `registration-otp-resend-${this.normalize(email)}`;
  }
}
