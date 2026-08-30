import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SaveQuestionnaireUseCase } from 'src/adequacy/application/usecases/profiles/save-questionnaire.usecase';
import { RepondreEtapeQuestionnaireUseCase } from 'src/adequacy/application/usecases/profiles/repondre-etape-questionnaire.usecase';
import { GetQuestionnaireUseCase } from 'src/adequacy/application/usecases/profiles/get-questionnaire.usecase';
import {
  CapaciteDePerteDto,
  PreQualificationDto,
  QualificationDto,
  SaveQuestionnaireDto,
} from './dto/questionnaire.dto';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';

/**
 * Le questionnaire d'adéquation : ce que le titulaire déclare de son
 * expérience, de son patrimoine et de ce qu'il peut perdre.
 *
 * **Le préfixe `profiles` est conservé, et c'est délibéré.** Ces six routes
 * vivaient dans `ProfileController` du temps où profil et questionnaire
 * partageaient un agrégat ; elles suivent désormais leur contexte, mais leurs
 * URLs ne bougent pas — un déplacement de fichiers ne doit rien coûter au front
 * (§3, la frontière est linguistique, pas d'écran).
 *
 * Les trois routes par étape suivent le parcours du cahier des charges, et
 * chacune rend la même chose : le questionnaire, l'étape suivante, et celles
 * déjà franchies. Le front n'a donc jamais à déduire où il en est — c'est le
 * domaine qui le lui dit, seuils réglementaires compris.
 */
@ApiTags('Profiles')
@ApiBearerAuth()
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class QuestionnaireController {
  constructor(
    private readonly saveQuestionnaireUseCase: SaveQuestionnaireUseCase,
    private readonly repondreEtape: RepondreEtapeQuestionnaireUseCase,
    private readonly getQuestionnaire: GetQuestionnaireUseCase,
  ) {}

  @ApiOperation({
    summary: "Étape 1 — pré-qualification du questionnaire d'adéquation",
  })
  @ApiResponse({
    status: 201,
    description: 'Étape enregistrée ; étape suivante indiquée',
  })
  @ApiResponse({ status: 409, description: "L'étape n'est pas ouverte" })
  @Post('questionnaire/pre-qualification')
  repondrePreQualification(
    @CurrentUser() user: ActiveUser,
    @Body() dto: PreQualificationDto,
  ) {
    return this.repondreEtape.preQualification(user.userId, dto);
  }

  @ApiOperation({
    summary: "Étape 2 — qualification du questionnaire d'adéquation",
  })
  @ApiResponse({
    status: 201,
    description: 'Étape enregistrée ; étape suivante indiquée',
  })
  @ApiResponse({ status: 409, description: "L'étape n'est pas ouverte" })
  @Post('questionnaire/qualification')
  repondreQualification(
    @CurrentUser() user: ActiveUser,
    @Body() dto: QualificationDto,
  ) {
    return this.repondreEtape.qualification(user.userId, dto);
  }

  @ApiOperation({
    summary: 'Étape 3 — simulation de la capacité à subir des pertes',
  })
  @ApiResponse({
    status: 201,
    description: 'Étape enregistrée ; montant conseillé calculé',
  })
  @ApiResponse({ status: 409, description: "L'étape n'est pas ouverte" })
  @Post('questionnaire/capacite-de-perte')
  repondreCapaciteDePerte(
    @CurrentUser() user: ActiveUser,
    @Body() dto: CapaciteDePerteDto,
  ) {
    return this.repondreEtape.capaciteDePerte(user.userId, dto);
  }

  @ApiOperation({
    summary: 'Où en est mon questionnaire : étape suivante et étapes franchies',
  })
  @ApiResponse({ status: 200, description: 'Avancement retourné' })
  @Get('questionnaire/etapes')
  getMesEtapes(@CurrentUser() user: ActiveUser) {
    return this.getQuestionnaire.executeEtapes(user.userId);
  }

  @ApiOperation({
    summary:
      "Sauvegarder le questionnaire d'adéquation PSFP (formulaire entier)",
    deprecated: true,
    description:
      "Reçoit les trois étapes d'un seul bloc, et ne dit pas laquelle vient " +
      'ensuite. Conservée pour le front actuel ; préférer les trois routes par ' +
      'étape.',
  })
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
