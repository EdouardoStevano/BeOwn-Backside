import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { OtpStore } from 'src/iam/applications/ports/otp-store.port';
import { randomInt } from 'crypto';

/**
 * Ce qui est gardé d'un OTP entre son envoi et sa saisie : le code, et le
 * nombre d'essais déjà consommés.
 */
interface OtpRecord {
  otp: string;
  attempts: number;
  otp_ttl: number;
}

/**
 * Stockage des OTP sur le cache applicatif.
 *
 * Branché directement sur `CACHE_MANAGER` : le service qui s'intercalait ici
 * n'était qu'un passe-plat de trois méthodes vers ce même cache. Les clés sont
 * composées par l'appelant (`otp:mfa:sms:42`, `otp:enroll:totp:42`,
 * `otp:email:<adresse>`) et déjà qualifiées.
 */
@Injectable()
export class RedisOtpStoreAdapter implements OtpStore {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async generateOtp(key: string): Promise<string> {
    const otpGenerated = randomInt(100000, 1_000_000).toString();
    await this.saveOtp(key, otpGenerated);
    return otpGenerated;
  }

  /**
   * ⚠️ Aucun TTL n'est posé, à l'identique du comportement d'origine : le champ
   * `otp_ttl` du record est renseigné mais n'a jamais été appliqué au cache.
   * Une entrée ne disparaît donc que par vérification ou invalidation
   * explicite. Sans conséquence tant que le cache est en mémoire (tout est
   * perdu au redémarrage), mais à corriger le jour où un store persistant est
   * câblé, sous peine de laisser un OTP « actif » indéfiniment.
   */
  private async saveOtp(key: string, otp: string): Promise<void> {
    const record: OtpRecord = {
      otp,
      attempts: 0,
      otp_ttl: Number(process.env.OTP_TTL),
    };
    await this.cache.set<OtpRecord>(key, record);
  }

  async verifyOtp(key: string, otp: string): Promise<boolean> {
    const record = await this.cache.get<OtpRecord>(key);
    if (!record) return false;

    if (record.attempts >= Number(process.env.MAX_ATTEMPTS)) {
      await this.cache.del(key);
      throw new Error('OTP invalidé : trop de tentatives');
    }

    if (record.otp !== otp) {
      await this.cache.set<OtpRecord>(key, {
        ...record,
        attempts: record.attempts + 1,
      });
      return false;
    }

    await this.cache.del(key);
    return true;
  }

  async hasActiveOtp(key: string): Promise<boolean> {
    const record = await this.cache.get<OtpRecord>(key);
    return !!record;
  }

  async invalidate(key: string): Promise<void> {
    await this.cache.del(key);
  }
}
