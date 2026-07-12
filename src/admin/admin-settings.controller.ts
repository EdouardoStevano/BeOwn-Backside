import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import {
  AdminSettingsEntity,
  AdminSettingsBlob,
} from './entities/admin-settings.entity';
import { DEFAULT_FEE_RATES } from 'src/common/platform-fees/platform-fees.service';

const ADMIN_ROLES: string[] = rolesWithPermission('settings:manage');

/**
 * Seules clés de commission autorisées à persister. Le merge PATCH repart de
 * cette liste blanche pour ne jamais ressusciter des clés legacy stockées
 * avant ce déploiement (investmentFeePct, secondaryMarketFeePct…).
 */
const COMMISSION_KEYS = [
  'annualPlatformFeePct',
  'rentManagementFeePct',
  'propertySaleGainFeePct',
  'resaleTransactionFeePct',
  'shareSaleGainFeePct',
] as const;

const DEFAULT_SETTINGS: AdminSettingsBlob = {
  platform: {
    name: 'BeOwn',
    contactEmail: 'support@beown.fr',
    defaultCurrency: 'EUR',
    timezone: 'Africa/Abidjan',
  },
  commissions: { ...DEFAULT_FEE_RATES },
  kyc: {
    provider: 'sumsub',
    minScoreAccepted: 60,
  },
  notifications: {
    defaultEmailFrom: 'noreply@beown.fr',
    smsProvider: 'twilio',
    digestFrequency: 'weekly',
  },
  feature_flags: {
    enableSecondaryMarket: true,
    enableNews: true,
    enable2FAEnforcement: false,
    enableMultilingualContent: false,
    psp_provider: 'stripe',
  },
};

@ApiTags('Admin – Settings')
@ApiBearerAuth()
@Controller('admin/settings')
@UseGuards(JwtAuthGuard)
@RequirePermission('settings:manage')
export class AdminSettingsController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(AdminSettingsEntity)
    private readonly settingsRepo: Repository<AdminSettingsEntity>,
  ) {}

  private async ensureRole(currentUser: ActiveUser, roles: string[]) {
    const u = await this.userRepo.findOne({
      where: { userId: currentUser.userId },
    });
    if (!u || !roles.includes(u.role)) {
      throw new ForbiddenException();
    }
  }

  /**
   * Chaque taux de commission fourni doit être un nombre fini entre 0 et 100.
   */
  private validateCommissions(
    commissions: NonNullable<AdminSettingsBlob['commissions']>,
  ) {
    for (const [key, value] of Object.entries(commissions)) {
      if (value === undefined) continue;
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100
      ) {
        throw new BadRequestException(
          `commissions.${key} doit être un nombre entre 0 et 100`,
        );
      }
    }
  }

  /**
   * Fusionne commissions stockées + patch en ne conservant QUE les 5 clés
   * connues (hygiène anti-legacy — voir COMMISSION_KEYS).
   */
  private mergeCommissions(
    stored: AdminSettingsBlob['commissions'],
    patch: AdminSettingsBlob['commissions'],
  ): NonNullable<AdminSettingsBlob['commissions']> {
    const merged: Record<string, unknown> = { ...stored, ...patch };
    const out: Record<string, number> = {};
    for (const key of COMMISSION_KEYS) {
      const value = merged[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = value;
      }
    }
    return out;
  }

  private async getOrCreate(): Promise<AdminSettingsEntity> {
    let row = await this.settingsRepo.findOne({ where: { id: 'default' } });
    if (!row) {
      row = this.settingsRepo.create({
        id: 'default',
        settings: DEFAULT_SETTINGS,
      });
      row = await this.settingsRepo.save(row);
    }
    return row;
  }

  @ApiOperation({ summary: 'Récupérer les paramètres plateforme' })
  @Get()
  async get(@CurrentUser() user: ActiveUser) {
    await this.ensureRole(user, ADMIN_ROLES);
    const row = await this.getOrCreate();
    return { ...DEFAULT_SETTINGS, ...row.settings, updatedAt: row.updatedAt };
  }

  @ApiOperation({ summary: 'Mettre à jour les paramètres (deep merge)' })
  @Patch()
  async update(
    @Body() body: Partial<AdminSettingsBlob>,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.ensureRole(user, ADMIN_ROLES);
    if (body.commissions) {
      this.validateCommissions(body.commissions);
    }
    const row = await this.getOrCreate();
    const merged: AdminSettingsBlob = {
      ...row.settings,
      ...body,
      platform: { ...row.settings.platform, ...body.platform },
      commissions: this.mergeCommissions(
        row.settings.commissions,
        body.commissions,
      ),
      kyc: { ...row.settings.kyc, ...body.kyc },
      notifications: { ...row.settings.notifications, ...body.notifications },
      feature_flags: {
        ...row.settings.feature_flags,
        ...body.feature_flags,
      },
    };
    await this.settingsRepo.update({ id: 'default' }, { settings: merged });
    return merged;
  }
}
