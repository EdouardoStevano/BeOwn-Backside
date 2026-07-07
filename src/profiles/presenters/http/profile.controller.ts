import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { CreateProfilPPUseCase } from 'src/profiles/applications/usecases/create-profil-pp.usecase';
import { CreateKycUseCase } from 'src/profiles/applications/usecases/create-kyc.usecase';
import { UpdateKycStatusUseCase } from 'src/profiles/applications/usecases/update-kyc-status.usecase';
import { GetProfilPPUseCase } from 'src/profiles/applications/usecases/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from 'src/profiles/applications/usecases/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from 'src/profiles/applications/usecases/create-profil-pm.usecase';
import { GetKycUseCase } from 'src/profiles/applications/usecases/get-kyc.usecase';
import { SaveQuestionnaireUseCase } from 'src/profiles/applications/usecases/save-questionnaire.usecase';
import { QuestionnaireAdequationEntity } from 'src/profiles/infrastructure/persistences/entities/questionnaire-adequation.entity';
import {
  CreateProfilPPDto,
  UpdateKycStatusDto,
  CreateProfilPMDto,
} from '../dto/profil.dto';
import { SaveQuestionnaireDto } from '../dto/questionnaire.dto';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import {
  hasPermission,
  rolesWithPermission,
} from 'src/common/auth/permissions.constants';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';

/** Rôles détenant `kyc:validate` — Compliance (+ super_admin via wildcard). */
const KYC_REVIEWER_ROLES: string[] = rolesWithPermission('kyc:validate');

@ApiTags('Profiles & KYC')
@ApiBearerAuth()
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly createProfilPP: CreateProfilPPUseCase,
    private readonly createKyc: CreateKycUseCase,
    private readonly updateKycStatus: UpdateKycStatusUseCase,
    private readonly getProfilPP: GetProfilPPUseCase,
    private readonly updateProfilPP: UpdateProfilPPUseCase,
    private readonly createProfilPM: CreateProfilPMUseCase,
    private readonly getKyc: GetKycUseCase,
    private readonly saveQuestionnaireUseCase: SaveQuestionnaireUseCase,
    @InjectRepository(QuestionnaireAdequationEntity)
    private readonly questionnaireRepo: Repository<QuestionnaireAdequationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly notifications: NotificationService,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  /** Défense en profondeur : mutation KYC réservée à `kyc:validate` (Compliance + super_admin). */
  private async assertKycReviewer(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !KYC_REVIEWER_ROLES.includes(u.role)) {
      throw new ForbiddenException(
        "Action réservée aux équipes admin / compliance.",
      );
    }
  }

  /** Auto-accès (son propre dossier) ou permission kyc:validate. */
  private assertSelfOrKycReviewer(user: ActiveUser, targetUserId: number): void {
    if (String(user.userId) === String(targetUserId)) return;
    if (!hasPermission(user.role, 'kyc:validate')) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  @ApiOperation({ summary: 'Créer le profil personne physique' })
  @ApiResponse({ status: 201, description: 'Profil PP créé' })
  @ApiResponse({ status: 409, description: 'Profil déjà existant' })
  @Post(':userId/pp')
  createPP(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: CreateProfilPPDto,
    @CurrentUser() user: ActiveUser,
  ) {
    this.assertSelfOrKycReviewer(user, userId);
    return this.createProfilPP.execute(userId, dto);
  }

  @ApiOperation({ summary: 'Initialiser le dossier KYC' })
  @ApiResponse({ status: 201, description: 'KYC créé' })
  @Post(':userId/kyc')
  initKyc(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: ActiveUser,
  ) {
    this.assertSelfOrKycReviewer(user, userId);
    return this.createKyc.execute(userId);
  }

  @ApiOperation({ summary: 'Mettre à jour le statut KYC (admin)' })
  @ApiResponse({ status: 200, description: 'Statut KYC mis à jour' })
  @ApiResponse({ status: 403, description: 'Réservé aux équipes admin / compliance' })
  @ApiResponse({ status: 404, description: 'KYC introuvable' })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('kyc:validate')
  @Patch(':userId/kyc/status')
  async patchKycStatus(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateKycStatusDto,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    await this.assertKycReviewer(currentUser);
    const updated = await this.updateKycStatus.execute(userId, dto.status, dto.motifRefus);

    if (dto.status === KycStatus.VALIDE) {
      this.notifications
        .push({
          utilisateurId: userId,
          type: NotificationType.KYC_VALIDE,
          titre: 'KYC validé',
          message:
            'Votre KYC a été validé. Vous pouvez désormais investir sur BeOwn.',
          metadata: { decidedAt: new Date().toISOString() },
        })
        .catch(() => {});
      this.notificationEvents.kycValidatedByAdmin(userId, currentUser.userId);
    } else if (dto.status === KycStatus.REFUSE) {
      this.notifications
        .push({
          utilisateurId: userId,
          type: NotificationType.KYC_REJETE,
          titre: 'KYC refusé',
          message: dto.motifRefus
            ? `Votre KYC a été refusé : ${dto.motifRefus}`
            : 'Votre KYC a été refusé. Merci de mettre à jour votre dossier.',
          metadata: { motifRefus: dto.motifRefus ?? null },
        })
        .catch(() => {});
      this.notificationEvents.kycRejectedByAdmin(userId, dto.motifRefus ?? '—', currentUser.userId);
    }

    return updated;
  }

  @ApiOperation({ summary: 'Obtenir mon profil PP' })
  @ApiResponse({ status: 200, description: 'Profil PP retourné' })
  @Get('pp/me')
  getMyProfilePP(@CurrentUser() user: ActiveUser) {
    return this.getProfilPP.execute(user.userId);
  }

  @ApiOperation({ summary: 'Mettre à jour mon profil PP' })
  @ApiResponse({ status: 200, description: 'Profil PP mis à jour' })
  @Patch('pp/me')
  updateMyProfilePP(
    @CurrentUser() user: ActiveUser,
    @Body() dto: Partial<CreateProfilPPDto>,
  ) {
    return this.updateProfilPP.execute(user.userId, dto);
  }

  @ApiOperation({ summary: 'Créer le profil personne morale' })
  @ApiResponse({ status: 201, description: 'Profil PM créé' })
  @Post('pm/me')
  createPM(@CurrentUser() user: ActiveUser, @Body() dto: CreateProfilPMDto) {
    return this.createProfilPM.execute(user.userId, dto);
  }

  @ApiOperation({ summary: 'Obtenir mon KYC' })
  @ApiResponse({ status: 200, description: 'KYC retourné' })
  @Get('kyc/me')
  getMyKyc(@CurrentUser() user: ActiveUser) {
    return this.getKyc.execute(user.userId);
  }

  @ApiOperation({ summary: 'Lister tous les KYC (admin)' })
  @ApiResponse({ status: 200, description: 'Liste paginée des KYC avec données utilisateur' })
  @RequirePermission('kyc:validate')
  @Get('kyc/all')
  listAllKyc(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.getKyc.executeAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @ApiOperation({ summary: "Sauvegarder le questionnaire d'adéquation PSFP" })
  @ApiResponse({ status: 201, description: 'Questionnaire enregistré, catégorie et plafond calculés' })
  @Post('questionnaire')
  saveQuestionnaire(
    @CurrentUser() user: ActiveUser,
    @Body() dto: SaveQuestionnaireDto,
  ) {
    return this.saveQuestionnaireUseCase.execute(user.userId, dto);
  }

  @ApiOperation({ summary: "Obtenir mon questionnaire d'adéquation" })
  @ApiResponse({ status: 200, description: 'Questionnaire retourné' })
  @Get('questionnaire/me')
  getMyQuestionnaire(@CurrentUser() user: ActiveUser) {
    return this.questionnaireRepo.findOne({ where: { utilisateurId: user.userId } });
  }
}
