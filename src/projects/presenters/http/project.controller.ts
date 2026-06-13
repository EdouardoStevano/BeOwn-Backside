import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CreateProjectUseCase } from 'src/projects/applications/usecases/create-project.usecase';
import { UpdateProjectUseCase } from 'src/projects/applications/usecases/update-project.usecase';
import { UpdateProjectStatusUseCase } from 'src/projects/applications/usecases/update-project-status.usecase';
import { GetProjectsUseCase } from 'src/projects/applications/usecases/get-projects.usecase';
import {
  CreateProjectDto,
  CreateSpvDto,
  UpdateProjectStatusDto,
} from '../dto/project.dto';
import {
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';
import type { ProjectRepository } from 'src/projects/applications/ports/repositories/project.repository';
import { PROJECT_REPOSITORY } from 'src/projects/applications/ports/repositories/project.repository';
import { Spv } from 'src/projects/domains/spv';
import { RegimeFiscal } from 'src/projects/domains/enums/regime-fiscal.enum';
import { INVESTMENT_REPOSITORY } from 'src/investments/applications/ports/repositories/investment.repository';
import type { InvestmentRepository } from 'src/investments/applications/ports/repositories/investment.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/applications/ports/repositories/document.repository';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { AVIS_REPOSITORY } from 'src/avis/applications/ports/repositories/avis.repository';
import type { AvisRepository } from 'src/avis/applications/ports/repositories/avis.repository';
import { DocumentType } from 'src/documents/domains/enums/document-type.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { Avis } from 'src/avis/domains/avis';
import { CreateAvisDto } from 'src/avis/presenters/dto/avis.dto';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { Public } from 'src/common/auth/public.decorator';
import { Roles } from 'src/common/auth/roles.decorator';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { SkipThrottle } from '@nestjs/throttler';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';

@SkipThrottle()
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectController {
  constructor(
    private readonly createProject: CreateProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
    private readonly updateStatus: UpdateProjectStatusUseCase,
    private readonly getProjects: GetProjectsUseCase,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(AVIS_REPOSITORY)
    private readonly avisRepository: AvisRepository,
    private readonly notificationService: NotificationService,
  ) {}

  @ApiOperation({
    summary:
      'Projets publics visibles (en collecte, pré-investissement, financés)',
    description:
      'Retourne les projets ouverts aux investisseurs : en_collecte, pre_investissement et finance. Filtrable par type, paginable.',
  })
  @ApiResponse({ status: 200, description: 'Liste des projets publics actifs' })
  @ApiQuery({ name: 'type', enum: ProjectType, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
  @Public()
  @Get('public')
  async listPublic(
    @Query('type') type?: ProjectType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.getProjects.execute({
      statuts: [
        ProjectStatus.EN_COLLECTE,
        ProjectStatus.PRE_INVESTISSEMENT,
        ProjectStatus.FINANCE,
      ],
      type,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
    const enriched = await this.enrichFractions(result.data);
    const withImages = await this.enrichImages(enriched);
    return { ...result, data: withImages };
  }

  @ApiOperation({ summary: 'Lister les projets (admin)' })
  @ApiResponse({ status: 200, description: 'Liste paginée des projets' })
  @ApiQuery({ name: 'statut', enum: ProjectStatus, required: false })
  @ApiQuery({ name: 'type', enum: ProjectType, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @Public()
  @Get()
  async list(
    @Query('statut') statut?: ProjectStatus,
    @Query('type') type?: ProjectType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.getProjects.execute({
      statut,
      type,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
    return { ...result, data: await this.enrichFractions(result.data) };
  }

  @ApiOperation({
    summary:
      'Obtenir un projet complet par ID (images, documents, avis, stats)',
  })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Projet complet' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.buildProjectDetail(id);
  }

  @ApiOperation({ summary: 'Obtenir un projet complet par slug' })
  @ApiParam({ name: 'slug', description: 'Slug lisible du projet' })
  @ApiResponse({ status: 200, description: 'Projet complet' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const project = await this.getProjects.executeBySlug(slug);
    if (!project) throw new NotFoundException('Projet introuvable.');
    return this.buildProjectDetail(project.id);
  }

  @ApiOperation({ summary: 'Créer un nouveau projet (admin)' })
  @ApiResponse({ status: 201, description: 'Projet créé' })
  @Roles(UserRole.ADMIN)
  @Post()
  async create(@Body() dto: CreateProjectDto) {
    const project = await this.createProject.execute(dto);

    // Broadcast temps réel à tous les investisseurs — sauf si brouillon (non visible)
    if (project.statut !== ProjectStatus.BROUILLON) {
      const lieu = [project.ville, project.pays].filter(Boolean).join(', ');
      this.notificationService
        .pushToInvestors({
          type: NotificationType.NOUVEAU_PROJET,
          titre: 'Nouveau projet disponible',
          message: lieu
            ? `Découvrez « ${project.titre} » à ${lieu}. Consultez les détails et investissez dès maintenant.`
            : `Découvrez le nouveau projet « ${project.titre} ». Consultez les détails et investissez dès maintenant.`,
          metadata: {
            projectId: project.id,
            slug: project.slug,
            statut: project.statut,
            ville: project.ville,
            type: project.type,
          },
        })
        .catch(() => {});
    }

    return project;
  }

  @ApiOperation({
    summary: 'Soumettre un projet pour revue (porteur)',
    description:
      "Le porteur soumet son projet : il est créé en BROUILLON, rattaché à son compte, et les administrateurs sont notifiés pour due diligence avant publication. Le porteur ne peut pas auto-publier.",
  })
  @ApiResponse({ status: 201, description: 'Projet soumis pour revue' })
  @Roles(UserRole.PORTEUR)
  @Post('submit')
  async submitByPorteur(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: ActiveUser,
  ) {
    // Le porteur ne contrôle ni le statut ni la visibilité : toujours brouillon
    const project = await this.createProject.execute(
      { ...dto, statut: ProjectStatus.BROUILLON },
      user.userId,
    );

    const lieu = [project.ville, project.pays].filter(Boolean).join(', ');
    this.notificationService
      .pushToAdmins({
        type: NotificationType.NOUVEAU_PROJET,
        titre: 'Nouveau projet soumis par un porteur',
        message: lieu
          ? `« ${project.titre} » (${lieu}) a été soumis pour revue. Vérifiez le dossier avant publication.`
          : `« ${project.titre} » a été soumis pour revue. Vérifiez le dossier avant publication.`,
        roles: [UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.FINANCIER],
        metadata: {
          projectId: project.id,
          slug: project.slug,
          porteurId: user.userId,
          type: project.type,
          ville: project.ville,
        },
      })
      .catch(() => {});

    return project;
  }

  @ApiOperation({ summary: "Mettre à jour les champs d'un projet (admin)" })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Projet mis à jour' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateProjectDto>) {
    return this.updateProject.execute(id, dto);
  }

  @ApiOperation({ summary: "Mettre à jour le statut d'un projet (admin)" })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @ApiResponse({ status: 400, description: 'Transition de statut invalide' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @Patch(':id/status')
  patchStatus(@Param('id') id: string, @Body() dto: UpdateProjectStatusDto) {
    return this.updateStatus.execute(id, dto.statut);
  }

  @ApiOperation({ summary: 'Créer une SPV' })
  @ApiResponse({ status: 201, description: 'SPV créée' })
  @Roles(UserRole.ADMIN)
  @Post('spv')
  async createSpv(@Body() dto: CreateSpvDto): Promise<Spv> {
    const spv = new Spv();
    spv.raisonSociale = dto.raisonSociale;
    spv.siren = dto.siren ?? null;
    spv.forme = dto.forme ?? null;
    spv.capitalSocial = dto.capitalSocial ?? null;
    spv.siegeAdresse = dto.siegeAdresse ?? null;
    spv.iban = null;
    // Equity-locatif fields (optional)
    spv.dateConstitution = dto.dateConstitution
      ? new Date(dto.dateConstitution)
      : null;
    spv.statutsPdfUrl = dto.statutsPdfUrl ?? null;
    spv.regimeFiscal = dto.regimeFiscal ?? RegimeFiscal.IS;
    spv.gestionnaireUserId = dto.gestionnaireUserId ?? null;
    return this.projectRepository.saveSpv(spv);
  }

  @ApiOperation({ summary: 'Lister les SPV' })
  @Get('spv/list')
  listSpv() {
    return this.projectRepository.findAllSpv();
  }

  // ─── Partage ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: "Obtenir le lien de partage d'un projet" })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Token de partage retourné' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Public()
  @Get(':id/share')
  async getShareToken(@Param('id') id: string) {
    const project = await this.projectRepository.findProjectById(id);
    if (!project) throw new NotFoundException('Projet introuvable.');
    const secret = process.env.PROJECT_SHARE_SECRET;
    if (!secret) {
      throw new Error('PROJECT_SHARE_SECRET is not configured.');
    }
    const token = createHash('sha256')
      .update(`${id}${secret}`)
      .digest('hex')
      .substring(0, 16);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return {
      shareToken: token,
      shareUrl: `${frontendUrl}/p/${token}`,
    };
  }

  @ApiOperation({
    summary: 'Obtenir un projet via son token de partage (accès public)',
  })
  @ApiParam({ name: 'token', description: 'Token de partage (16 caractères)' })
  @ApiResponse({ status: 200, description: 'Données publiques du projet' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Public()
  @Get('shared/:token')
  async findByShareToken(@Param('token') token: string) {
    const secret = process.env.PROJECT_SHARE_SECRET;
    if (!secret) {
      throw new Error('PROJECT_SHARE_SECRET is not configured.');
    }
    const allProjects = await this.getProjects.execute({
      statuts: [
        ProjectStatus.EN_COLLECTE,
        ProjectStatus.PRE_INVESTISSEMENT,
        ProjectStatus.FINANCE,
      ],
      page: 1,
      limit: 1000,
    });
    const project = allProjects.data.find((p) => {
      const expected = createHash('sha256')
        .update(`${p.id}${secret}`)
        .digest('hex')
        .substring(0, 16);
      return expected === token;
    });
    if (!project)
      throw new NotFoundException(
        'Lien de partage invalide ou projet introuvable.',
      );
    return this.buildProjectDetail(project.id);
  }

  // ─── Avis ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: "Lister les avis d'un projet" })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des avis' })
  @Public()
  @Get(':id/avis')
  async listAvis(@Param('id') id: string) {
    const project = await this.projectRepository.findProjectById(id);
    if (!project) throw new NotFoundException('Projet introuvable.');
    const [avis, stats] = await Promise.all([
      this.avisRepository.findByProjetId(id),
      this.avisRepository.getStats(id),
    ]);
    return { ...stats, avis };
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
  async createAvis(
    @Param('id') id: string,
    @Body() dto: CreateAvisDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const project = await this.projectRepository.findProjectById(id);
    if (!project) throw new NotFoundException('Projet introuvable.');

    const existing = await this.avisRepository.findByUserAndProjet(
      user.userId,
      id,
    );
    if (existing) {
      throw new BadRequestException(
        'Vous avez déjà soumis un avis pour ce projet.',
      );
    }

    const avis = new Avis();
    avis.projetId = id;
    avis.userId = user.userId;
    avis.note = dto.note;
    avis.commentaire = dto.commentaire ?? null;

    return this.avisRepository.save(avis);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async enrichFractions(projects: any[]) {
    if (projects.length === 0) return projects;
    const ids = projects.map((p) => p.id);
    const venduesMap =
      await this.investmentRepository.countFractionsVenduesBatch(ids);

    return projects.map((p) => {
      const prixFraction = Number(p.ticketMinimum);
      const nbFractionsTotal =
        p.nbFractions ?? Math.floor(Number(p.capitalCible) / prixFraction);
      const fractionsVendues = venduesMap[p.id] ?? 0;
      const fractionsDisponibles = Math.max(
        0,
        nbFractionsTotal - fractionsVendues,
      );
      const tauxRemplissage =
        nbFractionsTotal > 0
          ? Math.min(
              100,
              Math.round((fractionsVendues / nbFractionsTotal) * 1000) / 10,
            )
          : 0;
      return {
        ...p,
        fractions: {
          total: nbFractionsTotal,
          vendues: fractionsVendues,
          disponibles: fractionsDisponibles,
          prix: prixFraction,
        },
        stats: {
          montantCollecte: fractionsVendues * prixFraction,
          nbInvestisseurs: 0,
          tauxRemplissage,
        },
      };
    });
  }

  private async enrichImages(projects: any[]) {
    if (projects.length === 0) return projects;
    const imagesByProject = await Promise.all(
      projects.map((p) => this.documentRepository.findByProjectId(p.id)),
    );
    return projects.map((p, i) => {
      const images = imagesByProject[i]
        .filter((d) => d.type === DocumentType.PHOTO_PROJET)
        .sort((a, b) => {
          if (a.estPrincipale !== b.estPrincipale)
            return a.estPrincipale ? -1 : 1;
          return (a.ordre ?? 999) - (b.ordre ?? 999);
        });
      return { ...p, images };
    });
  }

  private async buildProjectDetail(id: string) {
    const [project, allInvestments, allDocs, avisStats, fractionsVendues] =
      await Promise.all([
        this.getProjects.executeOne(id),
        this.investmentRepository.findByProjetId(id),
        this.documentRepository.findByProjectId(id),
        this.avisRepository.getStats(id),
        this.investmentRepository.countFractionsVendues(id),
      ]);

    if (!project) throw new NotFoundException('Projet introuvable.');

    const prixFraction = Number(project.ticketMinimum);
    const nbFractionsTotal =
      project.nbFractions ??
      Math.floor(Number(project.capitalCible) / prixFraction);

    const activeStatuses: InvestmentStatus[] = [
      InvestmentStatus.CONFIRME,
      InvestmentStatus.SIGNE,
      InvestmentStatus.PAYE,
      InvestmentStatus.REMBOURSE_CAPITAL,
      InvestmentStatus.REMBOURSE_TOTAL,
    ];
    const activeInvestments = allInvestments.filter((i) =>
      activeStatuses.includes(i.statut),
    );
    const montantCollecte = activeInvestments.reduce(
      (sum, inv) => sum + Number(inv.montant),
      0,
    );
    const nbInvestisseurs = new Set(
      activeInvestments.map((i) => i.utilisateurId),
    ).size;

    const images = allDocs
      .filter((d) => d.type === DocumentType.PHOTO_PROJET)
      .sort((a, b) => {
        if (a.estPrincipale !== b.estPrincipale)
          return a.estPrincipale ? -1 : 1;
        return (a.ordre ?? 999) - (b.ordre ?? 999);
      });

    const documents = allDocs.filter(
      (d) => d.type !== DocumentType.PHOTO_PROJET,
    );

    return {
      ...project,
      prixFraction,
      localisation: {
        adresseComplete: project.adresseComplete,
        ville: project.ville,
        region: project.region,
        pays: project.pays,
        latitude: project.latitude,
        longitude: project.longitude,
      },
      images,
      documents,
      avis: avisStats,
      fractions: {
        total: nbFractionsTotal,
        vendues: fractionsVendues,
        disponibles: Math.max(0, nbFractionsTotal - fractionsVendues),
        prix: prixFraction,
      },
      stats: {
        montantCollecte,
        nbInvestisseurs,
        tauxRemplissage:
          nbFractionsTotal > 0
            ? Math.min(
                100,
                Math.round((fractionsVendues / nbFractionsTotal) * 1000) / 10,
              )
            : null,
      },
    };
  }
}
