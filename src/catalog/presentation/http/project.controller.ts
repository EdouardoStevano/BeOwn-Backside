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
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { Public } from 'src/iam/presentation/decorators/public.decorator';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { Roles } from 'src/iam/presentation/decorators/roles.decorator';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { ConsultProjectUseCase } from 'src/catalog/application/usecases/project/consult-project.usecase';
import { CreateProjectUseCase } from 'src/catalog/application/usecases/project/create-project.usecase';
import { GetProjectShareLinkUseCase } from 'src/catalog/application/usecases/project/get-project-share-link.usecase';
import { ListProjectsUseCase } from 'src/catalog/application/usecases/project/list-projects.usecase';
import { SubmitProjectUseCase } from 'src/catalog/application/usecases/project/submit-project.usecase';
import { UpdateProjectStatusUseCase } from 'src/catalog/application/usecases/project/update-project-status.usecase';
import { UpdateProjectUseCase } from 'src/catalog/application/usecases/project/update-project.usecase';
import {
  ProjectStatus,
  ProjectType,
} from 'src/catalog/domain/enums/project-status.enum';
import {
  CreateProjectDto,
  UpdateProjectDto,
  UpdateProjectStatusDto,
} from './dto/project.dto';
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
 * Le **contenu éditorial** de la fiche a ses propres contrôleurs :
 * `ProjectBlocsController` pour les pavés de texte enrichi,
 * `ProjectPhotosController` pour la galerie. Ni les uns ni l'autre ne passent
 * par `PATCH /projects/:id` — remplacer un tableau n'est pas une intention
 * métier, et laisserait poser deux blocs au même rang. Ce qu'ils écrivent
 * ressort en revanche ici, dans les clés `blocsDeContenu` et `photos` du projet.
 *
 * La **société de projet** a le sien aussi : `SpvController`. `Spv` est un
 * agrégat distinct, que le projet référence sans le contenir (§3.2, §6.2) —
 * ses deux routes n'avaient ici que le préfixe d'URL en commun, et forçaient à
 * déclarer `spv/list` avant `:id` pour que Nest ne prenne pas « spv » pour un
 * identifiant de projet.
 *
 * Les **avis** sont partis pour la même raison, chez `AvisController`, sous
 * `/avis/projet/:projetId`. `GET` et `POST /projects/:id/avis` n'existent plus :
 * ils doublonnaient trait pour trait deux routes de ce contrôleur, et une
 * ressource ne se sert pas sous deux contrats d'API. Le seul écart de rendu à
 * connaître pour la migration : la liste répondait ici
 * `{ noteMoyenne, nbAvis, avis }`, quand `GET /avis/projet/:projetId` ne rend
 * que le tableau — la note moyenne et le compte se lisent sur
 * `GET /avis/projet/:projetId/stats`, et la fiche projet les porte déjà.
 *
 * Ce qui reste ici est donc le projet lui-même : son catalogue, sa fiche, son
 * lien de partage, son cycle de vie.
 *
 * Les erreurs métier remontent telles quelles : `CatalogErrorFilter` les
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
}

/** Défauts historiques de la pagination : première page, vingt éléments. */
function pagination(page?: string, limit?: string) {
  return {
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
  };
}
