import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CreateProfilPPUseCase } from 'src/compliance/application/usecases/profiles/create-profil-pp.usecase';
import { GetProfilPPUseCase } from 'src/compliance/application/usecases/profiles/get-profil-pp.usecase';
import { UpdateProfilPPUseCase } from 'src/compliance/application/usecases/profiles/update-profil-pp.usecase';
import { CreateProfilPMUseCase } from 'src/compliance/application/usecases/profiles/create-profil-pm.usecase';
import { GetProfilPMUseCase } from 'src/compliance/application/usecases/profiles/get-profil-pm.usecase';
import { ListProfilsPMUseCase } from 'src/compliance/application/usecases/profiles/list-profils-pm.usecase';
import { UpdateProfilPMUseCase } from 'src/compliance/application/usecases/profiles/update-profil-pm.usecase';
import { SaveQuestionnaireUseCase } from 'src/compliance/application/usecases/profiles/save-questionnaire.usecase';
import { GetQuestionnaireUseCase } from 'src/compliance/application/usecases/profiles/get-questionnaire.usecase';
import {
  CreateProfilPPDto,
  CreateProfilPMDto,
  UpdateProfilPMDto,
} from './dto/profil.dto';
import { SaveQuestionnaireDto } from './dto/questionnaire.dto';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';

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
    private readonly listProfilsPM: ListProfilsPMUseCase,
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

  @ApiOperation({
    summary: 'Déclarer une société',
    description:
      'Chaque appel crée une société de plus : un compte peut en déclarer ' +
      'plusieurs. Refusé si le compte porte déjà un dossier personne ' +
      'physique — un titulaire est soit une personne physique, soit une ' +
      'personne morale.',
  })
  @ApiResponse({ status: 201, description: 'Société déclarée' })
  @ApiResponse({
    status: 409,
    description: 'Ce compte a déjà un dossier personne physique',
  })
  @Post('pm/me')
  createPM(@CurrentUser() user: ActiveUser, @Body() dto: CreateProfilPMDto) {
    return this.createProfilPM.execute(user.userId, dto);
  }

  @ApiOperation({
    summary: "Lister les sociétés que j'ai déclarées",
    description:
      "Rend un tableau, vide si le compte n'en a déclaré aucune — ne pas " +
      "avoir de société n'est pas une erreur, c'est l'état de départ.",
  })
  @ApiResponse({ status: 200, description: 'Liste des profils PM' })
  @Get('pm/me')
  listMyProfilesPM(@CurrentUser() user: ActiveUser) {
    return this.listProfilsPM.execute(user.userId);
  }

  @ApiOperation({ summary: "Obtenir le détail d'une de mes sociétés" })
  @ApiParam({ name: 'id', description: 'UUID du profil PM' })
  @ApiResponse({ status: 200, description: 'Profil PM retourné' })
  @ApiResponse({ status: 404, description: 'Profil PM introuvable' })
  @Get('pm/:id')
  getMyProfilePM(@CurrentUser() user: ActiveUser, @Param('id') id: string) {
    return this.getProfilPM.execute(user.userId, id);
  }

  @ApiOperation({
    summary: 'Mettre à jour mon profil personne morale',
    description:
      'Mise à jour partielle : seuls les champs présents dans le corps sont ' +
      'modifiés, `null` efface la valeur. La raison sociale ne peut pas être ' +
      'effacée — une société sans dénomination ne désigne personne.',
  })
  @ApiParam({ name: 'id', description: 'UUID du profil PM' })
  @ApiResponse({ status: 200, description: 'Profil PM mis à jour' })
  @ApiResponse({ status: 400, description: 'Donnée déclarée invalide' })
  @ApiResponse({ status: 404, description: 'Profil PM introuvable' })
  @Patch('pm/:id')
  updateMyProfilePM(
    @CurrentUser() user: ActiveUser,
    @Param('id') id: string,
    @Body() dto: UpdateProfilPMDto,
  ) {
    return this.updateProfilPM.execute(user.userId, id, dto);
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
