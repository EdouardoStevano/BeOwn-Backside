import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AdminSettingsEntity,
  AdminSettingsBlob,
} from 'src/admin/entities/admin-settings.entity';

/**
 * Lecture centralisée du singleton `admin_settings` (id = "default").
 * Fourni globalement pour être injectable dans les transports email/SMS sans
 * coupler ces derniers au module admin.
 */
@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectRepository(AdminSettingsEntity)
    private readonly settingsRepo: Repository<AdminSettingsEntity>,
  ) {}

  async getSettings(): Promise<AdminSettingsBlob> {
    const row = await this.settingsRepo.findOne({ where: { id: 'default' } });
    return row?.settings ?? {};
  }

  /** Expéditeur email configuré par l'admin, ou undefined si absent/vide. */
  async getDefaultEmailFrom(): Promise<string | undefined> {
    const from = (await this.getSettings()).notifications?.defaultEmailFrom;
    return typeof from === 'string' && from.trim() !== ''
      ? from.trim()
      : undefined;
  }
}
