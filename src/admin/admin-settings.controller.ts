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
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UpdateAdminSettingsDto } from './dto/update-admin-settings.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import {
  AdminSettingsEntity,
  AdminSettingsBlob,
  DEFAULT_BROADCAST_SETTINGS,
  mergeBroadcastSettings,
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

/**
 * Seules clés de plateforme autorisées à persister/être renvoyées. Le merge
 * repart de cette liste blanche pour ignorer silencieusement d'anciennes
 * clés stockées avant ce déploiement (defaultCurrency, timezone — retirées
 * car la devise de base est désormais fixée à EUR et le fuseau horaire
 * n'a jamais été branché).
 */
const PLATFORM_KEYS = ['name', 'contactEmail', 'supportPhone'] as const;

const DEFAULT_SETTINGS: AdminSettingsBlob = {
  platform: {
    name: 'BeOwn',
    contactEmail: 'support@beown.fr',
  },
  commissions: { ...DEFAULT_FEE_RATES },
  notifications: {
    defaultEmailFrom: 'noreply@beown.fr',
    digestFrequency: 'weekly',
    broadcast: DEFAULT_BROADCAST_SETTINGS,
  },
  feature_flags: {
    enableSecondaryMarket: true,
    enableNews: true,
    enable2FAEnforcement: false,
    enableMultilingualContent: false,
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

  /**
   * Fusionne platform stocké + patch en ne conservant QUE les clés connues
   * (hygiène anti-legacy — voir PLATFORM_KEYS). Utilisé à la fois en lecture
   * et en écriture pour qu'un blob legacy contenant encore defaultCurrency/
   * timezone ne soit jamais renvoyé ni ne provoque d'erreur.
   */
  private mergePlatform(
    stored: AdminSettingsBlob['platform'],
    patch: AdminSettingsBlob['platform'],
  ): NonNullable<AdminSettingsBlob['platform']> {
    const merged: Record<string, unknown> = { ...stored, ...patch };
    const out: Record<string, string> = {};
    for (const key of PLATFORM_KEYS) {
      const value = merged[key];
      if (typeof value === 'string') {
        out[key] = value;
      }
    }
    return out;
  }

  /**
   * Fusionne les notifications stockées + patch, en reconstruisant le
   * sous-objet `broadcast` clé par clé (mergeBroadcastSettings) : un PATCH
   * partiel (ex. `{ broadcast: { nouveauProjet: { sms: true } } }`) ne doit
   * pas effacer les autres canaux/événements, et une lecture doit toujours
   * renvoyer les 2 événements complets même si la base n'en stocke aucun.
   */
  private mergeNotifications(
    stored: AdminSettingsBlob['notifications'],
    patch: AdminSettingsBlob['notifications'],
  ): NonNullable<AdminSettingsBlob['notifications']> {
    return {
      ...stored,
      ...patch,
      broadcast: mergeBroadcastSettings({
        nouveauProjet: {
          ...stored?.broadcast?.nouveauProjet,
          ...patch?.broadcast?.nouveauProjet,
        },
        ouvertureReservation: {
          ...stored?.broadcast?.ouvertureReservation,
          ...patch?.broadcast?.ouvertureReservation,
        },
      }),
    };
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
    return {
      ...DEFAULT_SETTINGS,
      ...row.settings,
      platform: this.mergePlatform(
        DEFAULT_SETTINGS.platform,
        row.settings.platform,
      ),
      notifications: this.mergeNotifications(
        DEFAULT_SETTINGS.notifications,
        row.settings.notifications,
      ),
      updatedAt: row.updatedAt,
    };
  }

  @ApiOperation({ summary: 'Mettre à jour les paramètres (deep merge)' })
  @ApiBody({ type: UpdateAdminSettingsDto })
  @ApiResponse({ status: 400, description: 'Section ou valeur non autorisée' })
  @Patch()
  async update(
    @Body() body: UpdateAdminSettingsDto,
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
      platform: this.mergePlatform(row.settings.platform, body.platform),
      commissions: this.mergeCommissions(
        row.settings.commissions,
        body.commissions,
      ),
      notifications: this.mergeNotifications(
        row.settings.notifications,
        body.notifications,
      ),
      feature_flags: {
        ...row.settings.feature_flags,
        ...body.feature_flags,
      },
    };
    await this.settingsRepo.update({ id: 'default' }, { settings: merged });
    return merged;
  }
}
