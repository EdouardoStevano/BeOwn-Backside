import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatEur } from 'src/shared/money/format-eur';
import {
  PLAFOND_PORTEUR_12_MOIS_EUR,
  debutFenetreGlissante,
  verifierPlafondPorteur,
} from 'src/projects/domains/plafond-porteur';
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
    if (dto.capitalCible !== undefined) {
      // Art. 1(2)(c) : relever le capital cible d'une offre consomme le
      // plafond du porteur au même titre qu'en ouvrir une nouvelle.
      if (project.porteurId && dto.capitalCible > Number(project.capitalCible)) {
        const offres = await this.projectRepository.findOffresPorteurDepuis(
          project.porteurId,
          debutFenetreGlissante(new Date()),
          project.id,
        );
        const resultat = verifierPlafondPorteur(offres, dto.capitalCible);
        if (!resultat.autorise) {
          throw new BadRequestException(
            `Plafond de financement participatif dépassé : ce porteur a déjà ouvert ` +
              `${formatEur(resultat.dejaCollecte)} d'offres sur les douze derniers mois. ` +
              `Le plafond réglementaire est de ${formatEur(PLAFOND_PORTEUR_12_MOIS_EUR)} ` +
              `par porteur sur douze mois glissants. Marge restante : ${formatEur(resultat.disponible)}.`,
          );
        }
      }
      project.capitalCible = dto.capitalCible;
    }
    if (dto.capitalMinimum !== undefined)
      project.capitalMinimum = dto.capitalMinimum;
    if (dto.ticketMinimum !== undefined)
      project.ticketMinimum = dto.ticketMinimum ?? 100;
    if (dto.ticketMaximum !== undefined)
      project.ticketMaximum = dto.ticketMaximum ?? null;
    if (dto.triCible !== undefined) project.triCible = dto.triCible ?? null;
    if (dto.indiceRisque !== undefined) project.indiceRisque = dto.indiceRisque;
    if (dto.dureeMois !== undefined) project.dureeMois = dto.dureeMois;
    if (dto.instrument !== undefined) project.instrument = dto.instrument;
    if (dto.estPreInvestissable !== undefined)
      project.estPreInvestissable = dto.estPreInvestissable ?? false;
    if (dto.plafondPreInvestissement !== undefined)
      project.plafondPreInvestissement = dto.plafondPreInvestissement ?? null;
    if (dto.dateCloturePrevue !== undefined)
      project.dateCloturePrevue = dto.dateCloturePrevue
        ? new Date(dto.dateCloturePrevue)
        : null;
    if ((dto as any).datePublication !== undefined)
      (project as any).datePublication = (dto as any).datePublication
        ? new Date((dto as any).datePublication)
        : null;
    if ((dto as any).dateOuvertureCollecte !== undefined)
      (project as any).dateOuvertureCollecte = (dto as any)
        .dateOuvertureCollecte
        ? new Date((dto as any).dateOuvertureCollecte)
        : null;
    if (dto.descriptionMd !== undefined)
      project.descriptionMd = dto.descriptionMd ?? null;
    if (dto.avertissementMd !== undefined)
      project.avertissementMd = dto.avertissementMd ?? null;
    if (dto.adresseComplete !== undefined)
      project.adresseComplete = dto.adresseComplete ?? null;
    if (dto.latitude !== undefined) project.latitude = dto.latitude ?? null;
    if (dto.longitude !== undefined) project.longitude = dto.longitude ?? null;
    if (dto.youtubeUrl !== undefined)
      project.youtubeUrl = dto.youtubeUrl ?? null;
    if (dto.nbFractions !== undefined)
      project.nbFractions = dto.nbFractions ?? null;
    if (dto.prixFraction !== undefined)
      project.prixFraction = dto.prixFraction ?? null;
    if (dto.previsionnel !== undefined)
      project.previsionnel = dto.previsionnel ?? null;
    if (dto.chronologie !== undefined)
      project.chronologie = dto.chronologie ?? [];
    if (dto.garanties !== undefined) project.garanties = dto.garanties ?? [];

    return this.projectRepository.saveProject(project);
  }
}
