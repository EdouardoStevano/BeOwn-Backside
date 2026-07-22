import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';

/**
 * TTL of a registration OTP, in seconds. Deliberately its own env var and
 * default (10 min) — distinct from OTP_TTL (5 min), which is the 2FA/login
 * OTP used by CreateEmailOtpUseCase/CreateSmsOtpUseCase. The two flows share
 * nothing (different Redis key namespaces, different call sites) so they are
 * free to evolve independently.
 */
export const REGISTRATION_OTP_TTL_SECONDS = Number(
  process.env.REGISTRATION_OTP_TTL ?? 600,
);

/** Code invalidated after this many wrong guesses — caller must resend. */
export const REGISTRATION_OTP_MAX_ATTEMPTS = 5;

/** Minimum delay between two resends of the same registration OTP. */
export const REGISTRATION_OTP_RESEND_COOLDOWN_SECONDS = 60;

export enum RegistrationOtpVerifyResult {
  OK = 'OK',
  INVALID = 'INVALID',
  /** No record in Redis: never sent, already consumed, or its TTL elapsed. */
  EXPIRED = 'EXPIRED',
  TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS',
}

interface RegistrationOtpRecord {
  /** bcrypt hash of the 6-digit code — never the plaintext code. */
  codeHash: string;
  attempts: number;
  /** Epoch ms. Tracked in the record itself (not just the Redis TTL) so that
   * rewriting the record on a failed attempt never silently extends the
   * logical expiry — the Redis-level TTL passed to `set` is always the
   * remaining time until this timestamp, not a fresh full TTL. */
  expiresAt: number;
}

/**
 * Redis-backed store for the 6-digit code sent at signup to move an account
 * from CREE to EMAIL_VERIFIE. Purpose-namespaced key (`registration-otp-*`)
 * so it can never collide with the 2FA OTP store (`otp:email:*` /
 * `otp:sms:*`) or the email-verify/password-reset token store
 * (`email-token-*`), even for the same address.
 *
 * The code itself is hashed (bcrypt) before it ever touches Redis — a Redis
 * compromise (backup leak, misconfigured ACL, etc.) does not hand out live
 * codes, mirroring how passwords are never stored in cleartext.
 */
@Injectable()
export class RegistrationOtpService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
  ) {}

  private normalize(identifier: string): string {
    return identifier.toLowerCase().trim();
  }

  private codeKey(identifier: string): string {
    return `registration-otp-${this.normalize(identifier)}`;
  }

  private resendKey(identifier: string): string {
    return `registration-otp-resend-${this.normalize(identifier)}`;
  }

  /**
   * Generates a new 6-digit code, stores its hash (replacing any previous
   * code for this identifier) and (re)starts the 1/min resend cooldown.
   * Returns the plaintext code so the caller can deliver it (email/SMS) —
   * this is the only place the plaintext ever exists outside the user's
   * inbox/phone.
   */
  async generate(identifier: string): Promise<string> {
    const code = randomInt(100000, 1_000_000).toString();
    const codeHash = await this.hashingService.hash(code);
    const expiresAt = Date.now() + REGISTRATION_OTP_TTL_SECONDS * 1000;
    const record: RegistrationOtpRecord = { codeHash, attempts: 0, expiresAt };

    await this.cacheManager.set(
      this.codeKey(identifier),
      record,
      REGISTRATION_OTP_TTL_SECONDS * 1000,
    );
    await this.cacheManager.set(
      this.resendKey(identifier),
      Date.now(),
      REGISTRATION_OTP_RESEND_COOLDOWN_SECONDS * 1000,
    );

    return code;
  }

  async verify(
    identifier: string,
    code: string,
  ): Promise<RegistrationOtpVerifyResult> {
    const key = this.codeKey(identifier);
    const record = await this.cacheManager.get<RegistrationOtpRecord>(key);
    if (!record) return RegistrationOtpVerifyResult.EXPIRED;

    if (record.expiresAt <= Date.now()) {
      await this.cacheManager.del(key);
      return RegistrationOtpVerifyResult.EXPIRED;
    }

    if (record.attempts >= REGISTRATION_OTP_MAX_ATTEMPTS) {
      await this.cacheManager.del(key);
      return RegistrationOtpVerifyResult.TOO_MANY_ATTEMPTS;
    }

    const isMatch = await this.hashingService.compare(code, record.codeHash);
    if (!isMatch) {
      const attempts = record.attempts + 1;
      if (attempts >= REGISTRATION_OTP_MAX_ATTEMPTS) {
        await this.cacheManager.del(key);
        return RegistrationOtpVerifyResult.TOO_MANY_ATTEMPTS;
      }
      const remainingMs = record.expiresAt - Date.now();
      await this.cacheManager.set(key, { ...record, attempts }, remainingMs);
      return RegistrationOtpVerifyResult.INVALID;
    }

    // Single-use: the code is consumed on first successful verification.
    await this.cacheManager.del(key);
    return RegistrationOtpVerifyResult.OK;
  }

  /**
   * Clears the code (and its resend cooldown) so the caller can retry
   * immediately — used when the delivery attempt itself fails (mail/SMS
   * provider error) so the user isn't stuck holding a code they never
   * received for the rest of the TTL/cooldown window.
   */
  async invalidate(identifier: string): Promise<void> {
    await Promise.all([
      this.cacheManager.del(this.codeKey(identifier)),
      this.cacheManager.del(this.resendKey(identifier)),
    ]);
  }

  async isResendThrottled(identifier: string): Promise<boolean> {
    const marker = await this.cacheManager.get(this.resendKey(identifier));
    return !!marker;
  }
}
