import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
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
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import { EmailTemplateService } from 'src/common/email/email-template.service';
import { EmailTemplateEntity } from 'src/common/email/entities/email-template.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import {
  EMAIL_TEMPLATE_SAMPLES,
  TRIGGER_EVENTS,
} from './email-template.samples';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

const ADMIN_ROLES: string[] = rolesWithPermission('settings:manage');

/**
 * API back-office des templates d'emails transactionnels (V2-T2) : liste,
 * détail, édition (sujet / corps / activation), prévisualisation avec données
 * d'exemple et envoi d'un email de test à l'admin courant. Les clés sont
 * garanties présentes en base par le seed au boot (EmailTemplateService).
 *
 * L'audit des mutations (PATCH) est assuré par l'AuditInterceptor global.
 */
@ApiTags('Admin – Email Templates')
@ApiBearerAuth()
@Controller('admin/email-templates')
@UseGuards(JwtAuthGuard)
@RequirePermission('settings:manage')
export class AdminEmailTemplatesController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(EmailTemplateEntity)
    private readonly templateRepo: Repository<EmailTemplateEntity>,
    private readonly templates: EmailTemplateService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  /**
   * Défense en profondeur : le PermissionsGuard global filtre déjà sur le rôle
   * du JWT, mais on recharge le rôle en base pour refuser un token émis avant
   * une rétrogradation (même pattern qu'AdminSettingsController).
   */
  private async ensureRole(currentUser: ActiveUser, roles: string[]) {
    const u = await this.userRepo.findOne({
      where: { userId: currentUser.userId },
    });
    if (!u || !roles.includes(u.role)) {
      throw new ForbiddenException();
    }
  }

  private async getOr404(key: string): Promise<EmailTemplateEntity> {
    const row = await this.templateRepo.findOne({ where: { key } });
    if (!row) {
      throw new NotFoundException(`Template email « ${key} » introuvable`);
    }
    return row;
  }

  private summary(row: EmailTemplateEntity) {
    return {
      key: row.key,
      nom: row.nom,
      description: row.description,
      evenementDeclencheur: TRIGGER_EVENTS[row.key] ?? '',
      sujet: row.sujet,
      variables: row.variables,
      enabled: row.enabled,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
  }

  @ApiOperation({ summary: 'Lister les templates emails (sans le corps HTML)' })
  @Get()
  async list(@CurrentUser() user: ActiveUser) {
    await this.ensureRole(user, ADMIN_ROLES);
    const rows = await this.templateRepo.find({ order: { key: 'ASC' } });
    return rows.map((row) => this.summary(row));
  }

  @ApiOperation({ summary: "Détail d'un template (corps HTML inclus)" })
  @ApiResponse({ status: 404, description: 'Clé inconnue' })
  @Get(':key')
  async getOne(@Param('key') key: string, @CurrentUser() user: ActiveUser) {
    await this.ensureRole(user, ADMIN_ROLES);
    const row = await this.getOr404(key);
    return { ...this.summary(row), corpsHtml: row.corpsHtml };
  }

  @ApiOperation({ summary: 'Mettre à jour sujet / corps / activation' })
  @ApiResponse({ status: 404, description: 'Clé inconnue' })
  @Patch(':key')
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateEmailTemplateDto,
    @CurrentUser() user: ActiveUser,
  ) {
    await this.ensureRole(user, ADMIN_ROLES);
    const row = await this.getOr404(key);

    const patch: Partial<EmailTemplateEntity> = { updatedBy: user.email };
    if (dto.sujet !== undefined) patch.sujet = dto.sujet;
    if (dto.corpsHtml !== undefined) patch.corpsHtml = dto.corpsHtml;
    if (dto.enabled !== undefined) patch.enabled = dto.enabled;

    await this.templateRepo.update({ key }, patch);
    const updated = { ...row, ...patch };
    return { ...this.summary(updated), corpsHtml: updated.corpsHtml };
  }

  @ApiOperation({
    summary: "Prévisualiser le rendu avec des données d'exemple",
    description:
      'Rend le template même désactivé (renderForPreview) pour permettre son inspection.',
  })
  @ApiResponse({ status: 404, description: 'Clé inconnue' })
  @Post(':key/preview')
  @HttpCode(HttpStatus.OK)
  async preview(@Param('key') key: string, @CurrentUser() user: ActiveUser) {
    await this.ensureRole(user, ADMIN_ROLES);
    await this.getOr404(key);
    const rendered = await this.templates.renderForPreview(
      key,
      EMAIL_TEMPLATE_SAMPLES[key] ?? {},
    );
    if (!rendered) {
      throw new NotFoundException(
        `Template email « ${key} » introuvable (ni en base, ni dans le code)`,
      );
    }
    return { sujet: rendered.sujet, html: rendered.html };
  }

  @ApiOperation({
    summary: "Envoyer un email de test à l'admin courant",
    description:
      "Refuse (409) si le template est désactivé — l'activer avant d'envoyer un test.",
  })
  @ApiResponse({ status: 404, description: 'Clé inconnue' })
  @ApiResponse({ status: 409, description: 'Template désactivé' })
  @Post(':key/test')
  @HttpCode(HttpStatus.OK)
  async test(@Param('key') key: string, @CurrentUser() user: ActiveUser) {
    await this.ensureRole(user, ADMIN_ROLES);
    const row = await this.getOr404(key);
    if (!row.enabled) {
      throw new ConflictException(
        `Le template « ${key} » est désactivé — activez-le avant d'envoyer un test.`,
      );
    }

    const rendered = await this.templates.render(
      key,
      EMAIL_TEMPLATE_SAMPLES[key] ?? {},
    );
    if (!rendered) {
      throw new ConflictException(
        `Le template « ${key} » n'a pas pu être rendu — vérifiez sa syntaxe.`,
      );
    }

    if (!this.emailService.sendTransactionalEmail) {
      throw new ServiceUnavailableException(
        "Le service d'email actif ne supporte pas l'envoi transactionnel.",
      );
    }
    await this.emailService.sendTransactionalEmail(
      user.email,
      rendered.sujet,
      rendered.html,
    );
    return { ok: true, sentTo: user.email };
  }
}
