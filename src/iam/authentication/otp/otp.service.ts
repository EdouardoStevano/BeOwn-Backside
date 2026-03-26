import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { type Cache } from 'cache-manager';
import otpConfig from './config/otp.config';
import { type ConfigType } from '@nestjs/config';
import { truncate } from 'fs';

@Injectable()
export class OtpService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(otpConfig.KEY)
    private readonly otpConfiguration: ConfigType<typeof otpConfig>,
  ) {}

  generateOtp(): string {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
  }

  async saveOtp(email: string, otp: string) {
    const key = this.getOtpKey(email);
    await this.cacheManager.set(
      key,
      { otp, attempts: 0 },
      this.otpConfiguration.otpTtl * 1000,
    );
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const key = this.getOtpKey(email);
    const data = await this.cacheManager.get<{ otp: string; attempts: number }>(
      key,
    );

    if (!data) return false;

    if (data.attempts >= this.otpConfiguration.maxAttemps) {
      await this.cacheManager.del(key);
      throw new Error('OTP invalidé après trop de tentative');
    }

    if (data.otp != otp) {
      await this.cacheManager.set(
        key,
        { ...data, attempts: data.attempts + 1 },
        this.otpConfiguration.otpTtl * 1000,
      );

      return false;
    }

    await this.cacheManager.del(key);
    return true;
  }

  async hasActiveOtp(email: string): Promise<boolean> {
    const data = await this.cacheManager.get(this.getOtpKey(email));
    return !!data;
  }

  private getOtpKey(email: string) {
    return `otp:${email}`;
  }
}
