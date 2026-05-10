import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PROJECT_REPOSITORY } from '../ports/repositories/project.repository';
import type { ProjectRepository } from '../ports/repositories/project.repository';
import { CreateProjectDto } from 'src/projects/presenters/dto/project.dto';
import type { Project } from 'src/projects/domains/project';

type UpdateProjectDto = Partial<CreateProjectDto>;

@Injectable()
export class UpdateProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(id: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.projectRepository.findProjectById(id);
    if (!project) throw new NotFoundException('Projet introuvable.');

    if (dto.titre !== undefined) project.titre = dto.titre;
    if (dto.slug !== undefined) project.slug = dto.slug;
    if (dto.spvId !== undefined) (project as any).spvId = dto.spvId ?? null;
    if (dto.type !== undefined) project.type = dto.type;
    if (dto.ville !== undefined) project.ville = dto.ville ?? null;
    if (dto.region !== undefined) project.region = dto.region ?? null;
    if (dto.pays !== undefined) project.pays = dto.pays ?? 'CI';
    if (dto.capitalCible !== undefined) project.capitalCible = dto.capitalCible;
    if (dto.capitalMinimum !== undefined) project.capitalMinimum = dto.capitalMinimum;
    if (dto.ticketMinimum !== undefined) project.ticketMinimum = dto.ticketMinimum ?? 100;
    if (dto.ticketMaximum !== undefined) project.ticketMaximum = dto.ticketMaximum ?? null;
    if (dto.triCible !== undefined) project.triCible = dto.triCible ?? null;
    if (dto.dureeMois !== undefined) project.dureeMois = dto.dureeMois;
    if (dto.instrument !== undefined) project.instrument = dto.instrument;
    if (dto.estPreInvestissable !== undefined) project.estPreInvestissable = dto.estPreInvestissable ?? false;
    if (dto.plafondPreInvestissement !== undefined) project.plafondPreInvestissement = dto.plafondPreInvestissement ?? null;
    if (dto.dateCloturePrevue !== undefined) project.dateCloturePrevue = dto.dateCloturePrevue ? new Date(dto.dateCloturePrevue) : null;
    if ((dto as any).datePublication !== undefined) (project as any).datePublication = (dto as any).datePublication ? new Date((dto as any).datePublication) : null;
    if ((dto as any).dateOuvertureCollecte !== undefined) (project as any).dateOuvertureCollecte = (dto as any).dateOuvertureCollecte ? new Date((dto as any).dateOuvertureCollecte) : null;
    if (dto.descriptionMd !== undefined) project.descriptionMd = dto.descriptionMd ?? null;
    if (dto.avertissementMd !== undefined) project.avertissementMd = dto.avertissementMd ?? null;
    if (dto.adresseComplete !== undefined) project.adresseComplete = dto.adresseComplete ?? null;
    if (dto.latitude !== undefined) project.latitude = dto.latitude ?? null;
    if (dto.longitude !== undefined) project.longitude = dto.longitude ?? null;
    if (dto.youtubeUrl !== undefined) project.youtubeUrl = dto.youtubeUrl ?? null;
    if (dto.nbFractions !== undefined) project.nbFractions = dto.nbFractions ?? null;
    if (dto.prixFraction !== undefined) project.prixFraction = dto.prixFraction ?? null;
    if (dto.previsionnel !== undefined) project.previsionnel = dto.previsionnel ?? null;
    if (dto.chronologie !== undefined) project.chronologie = dto.chronologie ?? [];
    if (dto.garanties !== undefined) project.garanties = dto.garanties ?? [];

    return this.projectRepository.saveProject(project);
  }
}
