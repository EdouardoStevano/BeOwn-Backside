import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { type ConfigType } from '@nestjs/config';
import { generateSecret, generateURI, verify } from 'otplib';
import otpConfig from '../config/otp.config';
import { OtpService, TotpSecret } from 'src/iam/domain/ports/otp.service';
import { OtpTarget } from 'src/iam/domain/value-objects/otp-target.vo';
import { TooManyOtpAttemptsError } from 'src/iam/domain/errors/iam.errors';

/** Ce qu'on garde en cache pour un challenge en cours. */
interface OtpChallengeRecord {
  otp: string;
  attempts: number;
}

@Injectable()
export class OtplibOtpService implements OtpService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(otpConfig.KEY)
    private readonly config: ConfigType<typeof otpConfig>,
  ) {}

  async generate(target: OtpTarget): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await this.cache.set<OtpChallengeRecord>(
      target.storageKey,
      { otp: code, attempts: 0 },
      this.config.ttlSeconds * 1000,
    );

    return code;
  }

  async verify(target: OtpTarget, code: string): Promise<boolean> {
    const record = await this.cache.get<OtpChallengeRecord>(target.storageKey);
    if (!record) return false;

    if (record.attempts >= this.config.maxAttempts) {
      await this.cache.del(target.storageKey);
      throw new TooManyOtpAttemptsError();
    }

    if (record.otp !== code) {
      await this.cache.set<OtpChallengeRecord>(
        target.storageKey,
        { ...record, attempts: record.attempts + 1 },
        this.config.ttlSeconds * 1000,
      );
      return false;
    }

    // Un code correct est consommé : il ne peut pas resservir.
    await this.cache.del(target.storageKey);
    return true;
  }

  async hasActiveChallenge(target: OtpTarget): Promise<boolean> {
    return !!(await this.cache.get<OtpChallengeRecord>(target.storageKey));
  }

  async invalidate(target: OtpTarget): Promise<void> {
    await this.cache.del(target.storageKey);
  }

  generateTotpSecret(email: string): TotpSecret {
    const secret = generateSecret();
    const uri = generateURI({
      issuer: this.config.appName,
      label: email,
      secret,
    });
    return { uri, secret };
  }

  async verifyTotp(code: string, secret: string): Promise<boolean> {
    const result = await verify({ token: code, secret });
    return result.valid;
  }
}
