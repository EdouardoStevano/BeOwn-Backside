import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import {
  OtpRecord,
  OtpRecordStore,
} from 'src/iam/applications/ports/otp-record-store.port';

/**
 * Rangement des OTP sur le cache applicatif.
 *
 * Trois méthodes, aucune décision : c'est tout ce que le port demande depuis
 * que la politique (tirage du code, durée, plafond d'essais, consommation) a
 * rejoint `OtpService`. Cet adapter portait auparavant les deux, si bien qu'un
 * second magasin aurait recopié la politique avec lui.
 *
 * Le backend se choisit dans `CacheModule.register()` (`app.module.ts`), pas
 * ici. Les clés sont composées par l'appelant (`otp:mfa:sms:42`,
 * `otp:enroll:totp:42`, `otp:email:<adresse>`) et déjà qualifiées.
 */
@Injectable()
export class CacheOtpRecordStoreAdapter implements OtpRecordStore {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async save(key: string, record: OtpRecord, ttlMs: number): Promise<void> {
    // Un TTL négatif ou nul veut dire « déjà périmé » : `cache-manager`
    // interprète 0 comme « sans échéance », soit exactement l'inverse.
    if (ttlMs <= 0) {
      await this.cache.del(key);
      return;
    }

    await this.cache.set<OtpRecord>(key, record, ttlMs);
  }

  async find(key: string): Promise<OtpRecord | null> {
    return (await this.cache.get<OtpRecord>(key)) ?? null;
  }

  async delete(key: string): Promise<void> {
    await this.cache.del(key);
  }
}
