import { Body, Controller, Patch, Post, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CreateProfilPPUseCase } from 'src/profiles/applications/usecases/create-profil-pp.usecase';
import { GetProfilPPUseCase } from 'src/profiles/applications/usecases/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from 'src/profiles/applications/usecases/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from 'src/profiles/applications/usecases/create-profil-pm.usecase';
import { GetProfilPMUseCase } from 'src/profiles/applications/usecases/get-profil-pm.usecase';
import { UpdateProfilPMUseCase } from 'src/profiles/applications/usecases/update-profil-pm.usecase';
import { SaveQuestionnaireUseCase } from 'src/profiles/applications/usecases/save-questionnaire.usecase';
import { GetQuestionnaireUseCase } from 'src/profiles/applications/usecases/get-questionnaire.usecase';
import {
  CreateProfilPPDto,
  CreateProfilPMDto,
  UpdateProfilPMDto,
} from '../dto/profil.dto';
import { SaveQuestionnaireDto } from '../dto/questionnaire.dto';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';

/**
 * Le profil investisseur et son questionnaire d'adéquation.
 *
 * Les routes KYC — ouverture du dossier, revue manuelle, décision admin,
 * lectures — ont quitté ce contrôleur avec leur contexte : voir `KycController`
 * (`/kyc/*`). Les anciennes URLs `/profiles/kyc/*` restent servies, mais par
 * `KycLegacyProfilesController`, et sont dépréciées.
 */
@ApiTags('Profiles')
@ApiBearerAuth()
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly createProfilPP: CreateProfilPPUseCase,
    private readonly getProfilPP: GetProfilPPUseCase,
    private readonly updateProfilPP: UpdateProfilPPUseCase,
    private readonly createProfilPM: CreateProfilPMUseCase,
    private readonly getProfilPM: GetProfilPMUseCase,
    private readonly updateProfilPM: UpdateProfilPMUseCase,
    private readonly saveQuestionnaireUseCase: SaveQuestionnaireUseCase,
    private readonly getQuestionnaire: GetQuestionnaireUseCase,
  ) {}

  @ApiOperation({ summary: 'Créer mon profil personne physique' })
  @ApiResponse({ status: 201, description: 'Profil PP créé' })
  @ApiResponse({ status: 409, description: 'Profil déjà existant' })
  @Post('pp/me')
  createPP(@CurrentUser() user: ActiveUser, @Body() dto: CreateProfilPPDto) {
    return this.createProfilPP.execute(user.userId, dto);
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
