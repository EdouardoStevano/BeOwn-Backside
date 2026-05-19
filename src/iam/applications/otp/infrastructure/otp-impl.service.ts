import { Inject, Injectable } from '@nestjs/common';
import {
  OtpService,
  SecretOtpPayload,
} from '../applications/ports/otp.service';
import {
  CACHE_MANAGER_SERVICE,
  type CacheManagerService,
} from 'src/iam/domains/ports/cahe-manager.service';
import { generateSecret, generateURI, verify } from 'otplib';
import { ConfigService } from '@nestjs/config';

interface OtpRecord {
  otp: string;
  attempts: number;
  otp_ttl: number;
}

@Injectable()
export class RedisImplService implements OtpService {
  constructor(
    @Inject(CACHE_MANAGER_SERVICE)
    private readonly cacheManagerService: CacheManagerService,

    private readonly configService: ConfigService,
  ) {}

  async generateOtp(key: string): Promise<string> {
    const otpGenerated = Math.floor(100000 + Math.random() * 900000).toString();
    await this.saveOtp(key, otpGenerated);
    return otpGenerated;
  }

  private async saveOtp(key: string, otp: string): Promise<void> {
    const record: OtpRecord = {
      otp,
      attempts: 0,
      otp_ttl: Number(process.env.OTP_TTL),
    };
    await this.cacheManagerService.insert<OtpRecord>(key, record);
  }

  async verifyOtp(key: string, otp: string): Promise<boolean> {
    const record = await this.cacheManagerService.get<OtpRecord>(key);
    if (!record) return false;

    if (record.attempts >= Number(process.env.MAX_ATTEMPTS)) {
      await this.cacheManagerService.remove(key);
      throw new Error('OTP invalidé : trop de tentatives');
    }

    if (record.otp !== otp) {
      await this.cacheManagerService.insert<OtpRecord>(key, {
        ...record,
        attempts: record.attempts + 1,
      });
      return false;
    }

    await this.cacheManagerService.remove(key);
    return true;
  }

  async hasActiveOtp(key: string): Promise<boolean> {
    const record = await this.cacheManagerService.get<OtpRecord>(key);
    return !!record;
  }

  async invalidate(key: string): Promise<void> {
    await this.cacheManagerService.remove(key);
  }

  generateSecretTotp(email: string): SecretOtpPayload {
    const secret = generateSecret();
    const appName = this.configService.getOrThrow('TFA_APP_NAME');
    const uri = generateURI({ issuer: appName, label: email, secret });
    return { uri, secret };
  }

  verifyTotp(otp: string, secret: string) {
    return verify({ token: otp, secret });
  }
}
