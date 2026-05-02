import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateProjectUseCase } from 'src/projects/applications/usecases/create-project.usecase';
import { UpdateProjectStatusUseCase } from 'src/projects/applications/usecases/update-project-status.usecase';
import { GetProjectsUseCase } from 'src/projects/applications/usecases/get-projects.usecase';
import {
  CreateProjectDto,
  CreateSpvDto,
  UpdateProjectStatusDto,
} from '../dto/project.dto';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { Inject } from '@nestjs/common';
import type { ProjectRepository } from 'src/projects/applications/ports/repositories/project.repository';
import { PROJECT_REPOSITORY } from 'src/projects/applications/ports/repositories/project.repository';
import { Spv } from 'src/projects/domains/spv';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectController {
  constructor(
    private readonly createProject: CreateProjectUseCase,
    private readonly updateStatus: UpdateProjectStatusUseCase,
    private readonly getProjects: GetProjectsUseCase,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  @ApiOperation({ summary: 'Lister les projets' })
  @ApiResponse({ status: 200, description: 'Liste paginée des projets' })
  @ApiQuery({ name: 'statut', enum: ProjectStatus, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @Get()
  list(
    @Query('statut') statut?: ProjectStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.getProjects.execute({
      statut,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @ApiOperation({ summary: 'Obtenir un projet par ID' })
  @ApiResponse({ status: 200, description: 'Projet trouvé' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const project = await this.getProjects.executeOne(id);
    if (!project) throw new NotFoundException('Projet introuvable.');
    return project;
  }

  @ApiOperation({ summary: 'Obtenir un projet par slug' })
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const project = await this.getProjects.executeBySlug(slug);
    if (!project) throw new NotFoundException('Projet introuvable.');
    return project;
  }

  @ApiOperation({ summary: 'Créer un nouveau projet (admin)' })
  @ApiResponse({ status: 201, description: 'Projet créé' })
  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.createProject.execute(dto);
  }

  @ApiOperation({ summary: "Mettre à jour le statut d'un projet (admin)" })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @ApiResponse({ status: 400, description: 'Transition invalide' })
  @HttpCode(HttpStatus.OK)
  @Patch(':id/status')
  patchStatus(@Param('id') id: string, @Body() dto: UpdateProjectStatusDto) {
    return this.updateStatus.execute(id, dto.statut);
  }

  @ApiOperation({ summary: 'Créer une SPV' })
  @ApiResponse({ status: 201, description: 'SPV créée' })
  @Post('spv')
  async createSpv(@Body() dto: CreateSpvDto): Promise<Spv> {
    const spv = new Spv();
    spv.raisonSociale = dto.raisonSociale;
    spv.siren = dto.siren ?? null;
    spv.forme = dto.forme ?? null;
    spv.capitalSocial = dto.capitalSocial ?? null;
    spv.siegeAdresse = dto.siegeAdresse ?? null;
    spv.iban = null;
    return this.projectRepository.saveSpv(spv);
  }

  @ApiOperation({ summary: 'Lister les SPV' })
  @Get('spv/list')
  listSpv() {
    return this.projectRepository.findAllSpv();
  }
}
