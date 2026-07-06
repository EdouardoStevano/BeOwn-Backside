import {
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

const ADMIN_ROLES: string[] = rolesWithPermission('settings:manage');

const DEFAULT_SETTINGS: AdminSettingsBlob = {
  platform: {
    name: 'BeOwn',
    contactEmail: 'support@beown.com',
    defaultCurrency: 'XOF',
    timezone: 'Africa/Abidjan',
  },
  commissions: {
    investmentFeePct: 1.5,
    secondaryMarketFeePct: 2,
    earlyExitFeePct: 1,
  },
  kyc: {
    provider: 'sumsub',
    minScoreAccepted: 60,
  },
  notifications: {
    defaultEmailFrom: 'noreply@beown.com',
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
    const u = await this.userRepo.findOne({ where: { userId: currentUser.userId } });
    if (!u || !roles.includes(u.role)) {
      throw new ForbiddenException();
    }
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
    const row = await this.getOrCreate();
    const merged: AdminSettingsBlob = {
      ...row.settings,
      ...body,
      platform: { ...row.settings.platform, ...body.platform },
      commissions: { ...row.settings.commissions, ...body.commissions },
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
