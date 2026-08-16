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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { CreateProfilPPUseCase } from 'src/profiles/applications/usecases/create-profil-pp.usecase';
import { CreateKycUseCase } from 'src/profiles/applications/usecases/create-kyc.usecase';
import { RequestKycManualReviewUseCase } from 'src/profiles/applications/usecases/request-kyc-manual-review.usecase';
import { DecideKycManualReviewUseCase } from 'src/profiles/applications/usecases/decide-kyc-manual-review.usecase';
import { GetProfilPPUseCase } from 'src/profiles/applications/usecases/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from 'src/profiles/applications/usecases/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from 'src/profiles/applications/usecases/create-profil-pm.usecase';
import { GetProfilPMUseCase } from 'src/profiles/applications/usecases/get-profil-pm.usecase';
import { UpdateProfilPMUseCase } from 'src/profiles/applications/usecases/update-profil-pm.usecase';
import { GetKycUseCase } from 'src/profiles/applications/usecases/get-kyc.usecase';
import { SaveQuestionnaireUseCase } from 'src/profiles/applications/usecases/save-questionnaire.usecase';
import { GetQuestionnaireUseCase } from 'src/profiles/applications/usecases/get-questionnaire.usecase';
import {
  CreateProfilPPDto,
  UpdateKycStatusDto,
  CreateProfilPMDto,
  UpdateProfilPMDto,
} from '../dto/profil.dto';
import { SaveQuestionnaireDto } from '../dto/questionnaire.dto';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';

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
    private readonly requestKycManualReview: RequestKycManualReviewUseCase,
    private readonly decideKycManualReview: DecideKycManualReviewUseCase,
    private readonly getProfilPP: GetProfilPPUseCase,
    private readonly updateProfilPP: UpdateProfilPPUseCase,
    private readonly createProfilPM: CreateProfilPMUseCase,
    private readonly getProfilPM: GetProfilPMUseCase,
    private readonly updateProfilPM: UpdateProfilPMUseCase,
    private readonly getKyc: GetKycUseCase,
    private readonly saveQuestionnaireUseCase: SaveQuestionnaireUseCase,
    private readonly getQuestionnaire: GetQuestionnaireUseCase,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  /** Défense en profondeur : mutation KYC réservée à `kyc:validate` (Compliance + super_admin). */
  private async assertKycReviewer(user: ActiveUser): Promise<void> {
    const u = await this.userRepo.findOne({ where: { userId: user.userId } });
    if (!u || !KYC_REVIEWER_ROLES.includes(u.role)) {
      throw new ForbiddenException(
        'Action réservée aux équipes admin / compliance.',
      );
    }
  }

  @ApiOperation({ summary: 'Créer mon profil personne physique' })
  @ApiResponse({ status: 201, description: 'Profil PP créé' })
  @ApiResponse({ status: 409, description: 'Profil déjà existant' })
  @Post('pp/me')
  createPP(@CurrentUser() user: ActiveUser, @Body() dto: CreateProfilPPDto) {
    return this.createProfilPP.execute(user.userId, dto);
  }

  @ApiOperation({ summary: 'Initialiser mon dossier KYC' })
  @ApiResponse({ status: 201, description: 'KYC créé' })
  @Post('kyc/me')
  initKyc(@CurrentUser() user: ActiveUser) {
    return this.createKyc.execute(user.userId);
  }

  @ApiOperation({
    summary: 'Passer mon KYC en revue manuelle (dépôt manuel de documents)',
    description:
      "Fallback quand la vérification automatique Stripe Identity n'aboutit " +
      'pas (pas de réponse webhook, statut bloqué). Après téléversement manuel ' +
      "de la pièce d'identité + selfie, l'utilisateur passe son dossier en " +
      'revue manuelle (EN_REVUE) ; la compliance est notifiée pour décision ' +
      'via la route de décision manuelle existante.',
  })
  @ApiResponse({ status: 200, description: 'Dossier passé en revue manuelle' })
  @HttpCode(HttpStatus.OK)
  @Post('kyc/me/manual-review')
  requestManualReview(@CurrentUser() user: ActiveUser) {
    // L'alerte de la compliance a suivi le dossier : elle est déclenchée par
    // `KycRevueManuelleDemandeeEventHandler`, abonné au fait métier levé par le
    // use case. Le contrôleur ne sait plus quels rôles prévenir (§12.5).
    return this.requestKycManualReview.execute(user.userId);
  }

  @ApiOperation({
    summary: 'Décision manuelle sur un dossier KYC en revue (admin)',
    description:
      'Le KYC est validé automatiquement par Stripe Identity. Cette route ' +
      "n'agit que sur les dossiers passés en revue manuelle (EN_REVUE) suite " +
      'à un échec de la vérification automatique — un dossier auto-validé ' +
      "ou pas encore soumis est en lecture seule pour l'admin (409).",
  })
  @ApiResponse({ status: 200, description: 'Statut KYC mis à jour' })
  @ApiResponse({
    status: 403,
    description: 'Réservé aux équipes admin / compliance',
  })
  @ApiResponse({ status: 404, description: 'KYC introuvable' })
  @ApiResponse({
    status: 409,
    description: 'Dossier pas en revue manuelle — décision manuelle impossible',
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('kyc:validate')
  @Patch(':userId/kyc/status')
  async patchKycStatus(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateKycStatusDto,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    // La seule chose que la présentation garde de cette route : vérifier qui
    // appelle. Le reste — dossier réservé aux revues manuelles, écriture du
    // statut, annonce au titulaire et trace d'audit — appartient au use case et
    // à ses abonnés (§12.5).
    await this.assertKycReviewer(currentUser);

    return this.decideKycManualReview.execute({
      utilisateurId: userId,
      decision: dto.status,
      motifRefus: dto.motifRefus,
      decidePar: currentUser.userId,
    });
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

  @ApiOperation({ summary: 'Créer mon profil personne morale' })
  @ApiResponse({ status: 201, description: 'Profil PM créé' })
  @Post('pm/me')
  createPM(@CurrentUser() user: ActiveUser, @Body() dto: CreateProfilPMDto) {
    return this.createProfilPM.execute(user.userId, dto);
  }

  @ApiOperation({ summary: 'Obtenir le détail de mon profil personne morale' })
  @ApiResponse({ status: 200, description: 'Profil PM retourné' })
  @ApiResponse({ status: 404, description: 'Aucun profil PM pour ce compte' })
  @Get('pm/me')
  getMyProfilePM(@CurrentUser() user: ActiveUser) {
    return this.getProfilPM.execute(user.userId);
  }

  @ApiOperation({
    summary: 'Mettre à jour mon profil personne morale',
    description:
      'Mise à jour partielle : seuls les champs présents dans le corps sont ' +
      'modifiés, `null` efface la valeur. La raison sociale ne peut pas être ' +
      'effacée — une société sans dénomination ne désigne personne.',
  })
  @ApiResponse({ status: 200, description: 'Profil PM mis à jour' })
  @ApiResponse({ status: 400, description: 'Donnée déclarée invalide' })
  @ApiResponse({ status: 404, description: 'Aucun profil PM pour ce compte' })
  @Patch('pm/me')
  updateMyProfilePM(
    @CurrentUser() user: ActiveUser,
    @Body() dto: UpdateProfilPMDto,
  ) {
    return this.updateProfilPM.execute(user.userId, dto);
  }

  @ApiOperation({ summary: 'Obtenir mon KYC' })
  @ApiResponse({ status: 200, description: 'KYC retourné' })
  @Get('kyc/me')
  getMyKyc(@CurrentUser() user: ActiveUser) {
    return this.getKyc.execute(user.userId);
  }

  @ApiOperation({ summary: 'Lister tous les KYC (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des KYC avec données utilisateur',
  })
  @RequirePermission('kyc:validate')
  @Get('kyc/all')
  listAllKyc(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.getKyc.executeAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @ApiOperation({ summary: "Sauvegarder le questionnaire d'adéquation PSFP" })
  @ApiResponse({
    status: 201,
    description: 'Questionnaire enregistré, catégorie et plafond calculés',
  })
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
    return this.getQuestionnaire.execute(user.userId);
  }
}
