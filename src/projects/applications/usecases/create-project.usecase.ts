import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PROJECT_REPOSITORY } from '../ports/repositories/project.repository';
import type { ProjectRepository } from '../ports/repositories/project.repository';
import { CreateProjectDto } from 'src/projects/presenters/dto/project.dto';
import { Project } from 'src/projects/domains/project';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';

@Injectable()
export class CreateProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(dto: CreateProjectDto, porteurId?: number): Promise<Project> {
    const slug = dto.slug ?? this.generateSlug(dto.titre);
    const existing = await this.projectRepository.findProjectBySlug(slug);
    if (existing)
      throw new ConflictException('Un projet avec ce slug existe déjà.');

    const project = new Project();
    project.slug = slug;
    project.titre = dto.titre;
    project.spvId = dto.spvId ?? null;
    project.porteurId = porteurId ?? null;
    project.type = dto.type;
    project.ville = dto.ville ?? null;
    project.region = dto.region ?? null;
    project.pays = dto.pays ?? 'FR';
    project.capitalCible = dto.capitalCible;
    project.capitalMinimum = dto.capitalMinimum;
    project.ticketMinimum = dto.ticketMinimum ?? 100;
    project.ticketMaximum = dto.ticketMaximum ?? null;
    project.triCible = dto.triCible ?? null;
    project.dureeMois = dto.dureeMois;
    project.instrument = dto.instrument;
    project.statut = ProjectStatus.BROUILLON;
    project.estPreInvestissable = dto.estPreInvestissable ?? false;
    project.plafondPreInvestissement = dto.plafondPreInvestissement ?? null;
    project.datePublication = null;
    project.dateOuvertureCollecte = null;
    project.dateCloturePrevue = dto.dateCloturePrevue
      ? new Date(dto.dateCloturePrevue)
      : null;
    project.descriptionMd = dto.descriptionMd ?? null;
    project.avertissementMd = dto.avertissementMd ?? null;
    project.adresseComplete = dto.adresseComplete ?? null;
    project.latitude = dto.latitude ?? null;
    project.longitude = dto.longitude ?? null;
    project.youtubeUrl = dto.youtubeUrl ?? null;
    project.nbFractions = dto.nbFractions ?? null;
    project.prixFraction = dto.prixFraction ?? null;
    project.previsionnel = dto.previsionnel ?? null;
    project.chronologie = dto.chronologie ?? [];
    project.garanties = dto.garanties ?? [];

    return this.projectRepository.saveProject(project);
  }

  private generateSlug(titre: string): string {
    return titre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
}
