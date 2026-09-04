import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { hasPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { PersonneGeleeEntity } from './entities/personne-gelee.entity';
import { GelDesAvoirsService } from './gel-des-avoirs.service';
import { SanctionsScreeningService } from './sanctions-screening.service';

export class SetPepFlagDto {
  @ApiProperty() @IsBoolean() pepFlagged: boolean;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pepNote?: string;
}

/** Inscription manuelle d'une personne sur la liste interne de gel. */
export class CreatePersonneGeleeDto {
  @ApiProperty() @IsString() @IsNotEmpty() nom: string;
  @ApiProperty() @IsString() @IsNotEmpty() prenom: string;
  @ApiProperty({ required: false, description: 'yyyy-mm-dd' })
  @IsOptional()
  @IsDateString()
  dateNaissance?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) motif: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  source?: string;
}

/** Gel des avoirs d'un compte — le motif est OBLIGATOIRE (acte humain tracé). */
export class GelerAvoirsDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) motif: string;
}

/** Source par défaut : la seule alimentation prévue au prélancement. */
const SOURCE_PAR_DEFAUT = 'registre national des gels — saisie manuelle';

/**
 * Endpoints compliance — gestion PEP (Personne Politiquement Exposée).
 * Phase 10 stub : flag manuel posé/retiré par l'équipe compliance.
 * À étendre Phase 11 avec intégration vendor (SumSub, ComplyAdvantage).
 */
@ApiTags('Admin — Compliance')
@ApiBearerAuth()
@Controller('admin/compliance')
@UseGuards(JwtAuthGuard)
@RequirePermission('aml:manage')
export class AdminComplianceController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly auditLog: AuditLogService,
    // Gel des avoirs (lot 2, mission 4) — dernières positions à dessein.
    @InjectRepository(PersonneGeleeEntity)
    private readonly personneGeleeRepo: Repository<PersonneGeleeEntity>,
    private readonly gelDesAvoirs: GelDesAvoirsService,
    private readonly screening: SanctionsScreeningService,
  ) {}

  /**
   * Rôle RELU EN BASE avant toute mutation de conformité, et rendu pour que
   * l'audit enregistre le rôle RÉEL de l'acteur.
   *
   * Le contrôleur ne s'appuyait que sur le claim `aml:manage` du jeton, et
   * l'audit du flag PEP recopiait `admin.role` — donc une valeur fournie par
   * le jeton — avec un repli sur « compliance » quand le claim manquait. Un
   * jeton antérieur au retrait d'un accès conservait le pouvoir de geler des
   * avoirs, et le journal en attribuait l'acte à un rôle qui n'était peut-être
   * plus le sien.
   */
  private async assertAml(userId: number): Promise<string> {
    const acteur = await this.userRepo.findOne({
      where: { userId },
      select: ['userId', 'role'],
    });
    if (!acteur || !hasPermission(acteur.role, 'aml:manage')) {
      throw new ForbiddenException('Accès réservé à la conformité.');
    }
    return acteur.role;
  }

  @Get('pep')
  @ApiOperation({ summary: 'Liste des utilisateurs flaggés PEP' })
  async listPep() {
    return this.userRepo.find({
      where: { pepFlagged: true },
      select: [
        'userId',
        'firstname',
        'lastname',
        'pepFlagged',
        'pepNote',
        'role',
        'createdAt',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  @Post('pep/:userId')
  @ApiOperation({ summary: 'Activer ou désactiver le flag PEP sur un utilisateur' })
  async setPep(
    @Param('userId') userIdStr: string,
    @Body() dto: SetPepFlagDto,
    @CurrentUser() admin: ActiveUser,
  ) {
    const roleActeur = await this.assertAml(admin.userId);
    const targetUserId = parseInt(userIdStr, 10);
    if (!Number.isFinite(targetUserId)) {
      throw new BadRequestException('userId invalide.');
    }
    const user = await this.userRepo.findOne({
      where: { userId: targetUserId },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    user.pepFlagged = dto.pepFlagged;
    user.pepNote = dto.pepNote ?? null;
    const saved = await this.userRepo.save(user);

    await this.auditLog
      .create(
        String(admin.userId),
        roleActeur,
        dto.pepFlagged ? 'compliance.pep.flag' : 'compliance.pep.unflag',
        'user',
        String(targetUserId),
        undefined,
        undefined,
        { pepNote: dto.pepNote ?? null },
      )
      .catch(() => {});

    return {
      userId: saved.userId,
      pepFlagged: saved.pepFlagged,
      pepNote: saved.pepNote,
    };
  }

  // ─── Gel des avoirs (art. L. 562-4 CMF) — lot 2, mission 4 ────────────────
  // Toutes ces mutations sont journalisées par l'AuditInterceptor global
  // (POST/DELETE authentifiés) ; gel/dégel ajoutent en plus une entrée
  // d'audit métier explicite dans GelDesAvoirsService.

  @Get('gel/personnes')
  @ApiOperation({ summary: 'Liste interne des personnes visées par une mesure de gel' })
  async listerPersonnesGelees() {
    return this.personneGeleeRepo.find({ order: { creeLe: 'DESC' } });
  }

  @Post('gel/personnes')
  @ApiOperation({ summary: 'Inscrire une personne sur la liste interne de gel (saisie manuelle)' })
  async creerPersonneGelee(
    @Body() dto: CreatePersonneGeleeDto,
    @CurrentUser() admin: ActiveUser,
  ) {
    await this.assertAml(admin.userId);
    const saved = await this.personneGeleeRepo.save(
      this.personneGeleeRepo.create({
        nom: dto.nom.trim(),
        prenom: dto.prenom.trim(),
        dateNaissance: dto.dateNaissance ?? null,
        motif: dto.motif,
        source: dto.source ?? SOURCE_PAR_DEFAUT,
        actif: true,
        creePar: admin.userId,
      }),
    );
    return saved;
  }

  @Post('gel/personnes/:id/desactiver')
  @ApiOperation({ summary: 'Désactiver une inscription (radiation du registre) — jamais de suppression' })
  async desactiverPersonneGelee(
    @Param('id') id: string,
    @CurrentUser() admin: ActiveUser,
  ) {
    await this.assertAml(admin.userId);
    const personne = await this.personneGeleeRepo.findOne({ where: { id } });
    if (!personne) throw new NotFoundException('Inscription introuvable.');
    personne.actif = false;
    return this.personneGeleeRepo.save(personne);
  }

  @Get('gel/users')
  @ApiOperation({ summary: 'Comptes dont les avoirs sont actuellement gelés' })
  async listerComptesGeles() {
    return this.gelDesAvoirs.listerComptesGeles();
  }

  @Post('gel/users/:userId')
  @ApiOperation({
    summary:
      "Geler les avoirs d'un compte (acte humain, motif obligatoire). Le screening signale, l'humain gèle.",
  })
  async gelerAvoirs(
    @Param('userId') userIdStr: string,
    @Body() dto: GelerAvoirsDto,
    @CurrentUser() admin: ActiveUser,
  ) {
    await this.assertAml(admin.userId);
    const targetUserId = this.parseUserId(userIdStr);

    // Un gel coupe dépôt, souscription, retrait et achat au marché
    // secondaire. Deux cibles sont donc interdites :
    //
    //  - SOI-MÊME : un compte compliance qui se gèle se prive du levier dont
    //    il a la charge, et l'acte n'a aucun sens de conformité — le gel vise
    //    une contrepartie, pas son instructeur ;
    //  - un SUPER_ADMIN : c'est le seul rôle qui puisse tout rétablir. Le
    //    geler, c'est se donner les moyens de neutraliser l'administration de
    //    la plateforme depuis un rôle de contrôle, et la levée du gel exige
    //    précisément le compte qu'on vient de bloquer.
    if (targetUserId === admin.userId) {
      throw new BadRequestException(
        'Un compte ne peut pas geler ses propres avoirs.',
      );
    }
    const cible = await this.userRepo.findOne({
      where: { userId: targetUserId },
      select: ['userId', 'role'],
    });
    if (!cible) throw new NotFoundException('Utilisateur introuvable.');
    if (cible.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        "Les avoirs d'un super_admin ne peuvent pas être gelés depuis cet endpoint.",
      );
    }

    return this.gelDesAvoirs.geler(targetUserId, dto.motif, admin);
  }

  @Delete('gel/users/:userId')
  @ApiOperation({ summary: "Lever le gel des avoirs d'un compte" })
  async degelerAvoirs(
    @Param('userId') userIdStr: string,
    @CurrentUser() admin: ActiveUser,
  ) {
    await this.assertAml(admin.userId);
    return this.gelDesAvoirs.degeler(this.parseUserId(userIdStr), admin);
  }

  @Post('gel/rescan')
  @ApiOperation({
    summary:
      'Re-scan global des comptes contre la liste active — crée des alertes, ne gèle jamais seul',
  })
  async rescanGlobal(@CurrentUser() admin: ActiveUser) {
    await this.assertAml(admin.userId);
    return this.screening.rescanTous();
  }

  private parseUserId(userIdStr: string): number {
    const userId = parseInt(userIdStr, 10);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('userId invalide.');
    }
    return userId;
  }
}
