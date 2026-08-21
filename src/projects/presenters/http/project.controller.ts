import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateAvisDto } from 'src/avis/presenters/dto/avis.dto';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { Public } from 'src/iam/presentation/decorators/public.decorator';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { Roles } from 'src/iam/presentation/decorators/roles.decorator';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { ConsultAvisProjetUseCase } from 'src/projects/applications/usecases/avis/consult-avis-projet.usecase';
import { ConsultProjectUseCase } from 'src/projects/applications/usecases/project/consult-project.usecase';
import { CreateProjectUseCase } from 'src/projects/applications/usecases/project/create-project.usecase';
import { GetProjectShareLinkUseCase } from 'src/projects/applications/usecases/project/get-project-share-link.usecase';
import { ListProjectsUseCase } from 'src/projects/applications/usecases/project/list-projects.usecase';
import { SubmitProjectUseCase } from 'src/projects/applications/usecases/project/submit-project.usecase';
import { UpdateProjectStatusUseCase } from 'src/projects/applications/usecases/project/update-project-status.usecase';
import { UpdateProjectUseCase } from 'src/projects/applications/usecases/project/update-project.usecase';
import { CreateSpvUseCase } from 'src/projects/applications/usecases/spv/create-spv.usecase';
import { ListSpvUseCase } from 'src/projects/applications/usecases/spv/list-spv.usecase';
import {
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';
import {
  CreateProjectDto,
  CreateSpvDto,
  UpdateProjectDto,
  UpdateProjectStatusDto,
} from '../dto/project.dto';
import {
  versModificationProjet,
  versPropsDeCreation,
} from './project.presenter';

/**
 * Catalogue des projets.
 *
 * Le contrôleur ne fait plus que ce que la couche présentation doit faire :
 * valider l'entrée, traduire la requête en appel de use case, rendre la
 * réponse (§12.5). Il injectait auparavant `PROJECT_REPOSITORY`,
 * `AVIS_REPOSITORY` et un `Repository<ProjectViewEntity>` TypeORM — trois
 * adapters de sortie atteints directement depuis un adapter d'entrée (§12.9) —
 * et portait une méthode privée de traçage, la composition de deux
 * notifications, la construction d'un agrégat `Spv`, celle d'un agrégat `Avis`
 * d'un autre contexte, et deux implémentations du jeton de partage.
 *
 * Les erreurs métier remontent telles quelles : `ProjectsErrorFilter` les
 * traduit en statuts HTTP.
 */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectController {
  constructor(
    private readonly createProject: CreateProjectUseCase,
    private readonly submitProject: SubmitProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
    private readonly updateStatus: UpdateProjectStatusUseCase,
    private readonly listProjects: ListProjectsUseCase,
    private readonly consultProject: ConsultProjectUseCase,
    private readonly shareLink: GetProjectShareLinkUseCase,
    private readonly createSpv: CreateSpvUseCase,
    private readonly listSpv: ListSpvUseCase,
    private readonly avis: ConsultAvisProjetUseCase,
  ) {}

  // ─── Catalogue ─────────────────────────────────────────────────────────────

  @ApiOperation({
    summary:
      'Projets publics visibles (en annonce, pré-investissement, en collecte, financés)',
    description:
      'Retourne les projets ouverts aux investisseurs : annonce, pre_investissement, en_collecte et finance. Filtrable par type, paginable.',
  })
  @ApiResponse({ status: 200, description: 'Liste des projets publics actifs' })
  @ApiQuery({ name: 'type', enum: ProjectType, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
  @Public()
  @Get('public')
  listPublic(
    @Query('type') type?: ProjectType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.listProjects.executePublic({
      type,
      ...pagination(page, limit),
    });
  }

  @ApiOperation({ summary: 'Lister les projets (admin)' })
  @ApiResponse({ status: 200, description: 'Liste paginée des projets' })
  @ApiQuery({ name: 'statut', enum: ProjectStatus, required: false })
  @ApiQuery({ name: 'type', enum: ProjectType, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @Get()
  @RequirePermission('projects:read')
  list(
    @Query('statut') statut?: ProjectStatus,
    @Query('type') type?: ProjectType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.listProjects.executeAdmin({
      statut,
      type,
      ...pagination(page, limit),
    });
  }

  // ─── SPV ───────────────────────────────────────────────────────────────────
  //
  // Déclarées avant les routes paramétrées : `spv/list` doit être appariée
  // avant `:id`, sinon Nest la résout comme un projet d'identifiant « spv ».

  @ApiOperation({ summary: 'Créer une SPV' })
  @ApiResponse({ status: 201, description: 'SPV créée' })
  @RequirePermission('projects:manage', 'spv:manage')
  @Post('spv')
  createSpvEndpoint(@Body() dto: CreateSpvDto) {
    return this.createSpv.execute(dto);
  }

  @ApiOperation({ summary: 'Lister les SPV' })
  @Get('spv/list')
  listSpvEndpoint() {
    return this.listSpv.execute();
  }

  // ─── Partage ───────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Obtenir un projet via son token de partage (accès public)',
  })
  @ApiParam({ name: 'token', description: 'Token de partage (16 caractères)' })
  @ApiResponse({ status: 200, description: 'Données publiques du projet' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Public()
  @Get('shared/:token')
  findByShareToken(@Param('token') token: string) {
    return this.consultProject.executeParJetonDePartage(token);
  }

  @ApiOperation({ summary: 'Obtenir un projet complet par slug' })
  @ApiParam({ name: 'slug', description: 'Slug lisible du projet' })
  @ApiResponse({ status: 200, description: 'Projet complet' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Public()
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.consultProject.executeParSlug(slug);
  }

  // ─── Fiche projet ──────────────────────────────────────────────────────────

  @ApiOperation({
    summary:
      'Obtenir un projet complet par ID (images, documents, avis, stats)',
  })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Projet complet' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Get(':id')
  @RequirePermission('projects:read')
  findOne(@Param('id') id: string) {
    return this.consultProject.executePourAdmin(id);
  }

  @ApiOperation({
    summary:
      "Détail d'un projet pour un investisseur authentifié (hors brouillon)",
    description:
      "Endpoint accessible à tout utilisateur connecté (les investisseurs n'ont pas la permission back-office projects:read). Renvoie la vue publique du projet (documents publics) et enregistre la consultation : la 2ᵉ consultation du même projet par le même utilisateur alerte le chargé de relation.",
  })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Détail projet (vue investisseur)' })
  @ApiResponse({ status: 404, description: 'Projet introuvable ou brouillon' })
  @Get(':id/investor-view')
  investorView(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    return this.consultProject.executePourInvestisseur(id, user.userId);
  }

  @ApiOperation({ summary: "Obtenir le lien de partage d'un projet" })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Token de partage retourné' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Get(':id/share')
  @RequirePermission('projects:read')
  getShareToken(@Param('id') id: string) {
    return this.shareLink.execute(id);
  }

  // ─── Écriture ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Créer un nouveau projet (admin)' })
  @ApiResponse({ status: 201, description: 'Projet créé' })
  @RequirePermission('projects:manage')
  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.createProject.execute(versPropsDeCreation(dto));
  }

  @ApiOperation({
    summary: 'Soumettre un projet pour revue (porteur)',
    description:
      'Le porteur soumet son projet : il est créé en BROUILLON, rattaché à son compte, et les administrateurs sont notifiés pour due diligence avant publication. Le porteur ne peut pas auto-publier.',
  })
  @ApiResponse({ status: 201, description: 'Projet soumis pour revue' })
  @Roles(UserRole.PORTEUR)
  @Post('submit')
  submitByPorteur(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.submitProject.execute(versPropsDeCreation(dto), user.userId);
  }

  @ApiOperation({ summary: "Mettre à jour les champs d'un projet (admin)" })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Projet mis à jour' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.updateProject.execute(id, versModificationProjet(dto));
  }

  @ApiOperation({ summary: "Mettre à jour le statut d'un projet (admin)" })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @ApiResponse({ status: 400, description: 'Transition de statut invalide' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  @Patch(':id/status')
  patchStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProjectStatusDto,
    @CurrentUser() user: ActiveUser,
  ) {
    // `user.userId` sert de déclencheur audité de la diffusion quand la
    // transition ouvre l'annonce ou la collecte.
    return this.updateStatus.execute(id, dto.statut, user.userId);
  }

  // ─── Avis ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: "Lister les avis d'un projet" })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des avis' })
  @Public()
  @Get(':id/avis')
  listAvis(@Param('id') id: string) {
    return this.avis.lister(id);
  }

  @ApiOperation({
    summary: 'Donner un avis sur un projet (un seul par utilisateur)',
  })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiBody({ type: CreateAvisDto })
  @ApiResponse({ status: 201, description: 'Avis enregistré' })
  @ApiResponse({
    status: 400,
    description: 'Avis déjà soumis ou projet non éligible',
  })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Post(':id/avis')
  createAvis(
    @Param('id') id: string,
    @Body() dto: CreateAvisDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.avis.soumettre({
      projetId: id,
      utilisateurId: user.userId,
      note: dto.note,
      commentaire: dto.commentaire,
    });
  }
}

/** Défauts historiques de la pagination : première page, vingt éléments. */
function pagination(page?: string, limit?: string) {
  return {
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
  };
}
