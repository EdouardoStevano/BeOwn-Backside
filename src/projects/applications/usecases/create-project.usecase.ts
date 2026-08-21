import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
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
import { Project } from 'src/projects/domains/project';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { ConflitsInteretsService } from '../conflits-interets.service';

@Injectable()
export class CreateProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    private readonly conflitsInterets: ConflitsInteretsService,
  ) {}

  async execute(dto: CreateProjectDto, porteurId?: number): Promise<Project> {
    const slug = dto.slug ?? this.generateSlug(dto.titre);
    const existing = await this.projectRepository.findProjectBySlug(slug);
    if (existing)
      throw new ConflictException('Un projet avec ce slug existe déjà.');

    // Art. 8 : les interdictions de conflit d'intérêts se vérifient avant tout
    // le reste — une offre interdite n'a pas à être examinée au fond.
    if (porteurId) await this.conflitsInterets.assertPorteurEligible(porteurId);

    await this.verifierPlafondPorteur(porteurId, dto.capitalCible);

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
    project.indiceRisque = dto.indiceRisque ?? 3;
    project.dureeMois = dto.dureeMois;
    project.instrument = dto.instrument;
    project.statut = dto.statut ?? ProjectStatus.BROUILLON;
    project.estPreInvestissable = dto.estPreInvestissable ?? false;
    project.plafondPreInvestissement = dto.plafondPreInvestissement ?? null;
    project.datePublication = dto.datePublication
      ? new Date(dto.datePublication)
      : null;
    project.dateOuvertureCollecte = dto.dateOuvertureCollecte
      ? new Date(dto.dateOuvertureCollecte)
      : null;
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

  /**
   * Art. 1(2)(c) : la contrepartie totale des offres d'un même porteur ne peut
   * excéder 5 M€ sur douze mois glissants. Le plafond porte sur le PORTEUR, pas
   * sur le projet : sans porteur identifié, on ne peut pas l'agréger, et le
   * contrôle est reporté sur la validation `@Max` du DTO.
   */
  private async verifierPlafondPorteur(
    porteurId: number | undefined,
    capitalCible: number,
    exclureProjetId?: string,
  ): Promise<void> {
    if (!porteurId) return;

    const offres = await this.projectRepository.findOffresPorteurDepuis(
      porteurId,
      debutFenetreGlissante(new Date()),
      exclureProjetId,
    );

    const resultat = verifierPlafondPorteur(offres, capitalCible);
    if (!resultat.autorise) {
      throw new BadRequestException(
        `Plafond de financement participatif dépassé : ce porteur a déjà ouvert ` +
          `${formatEur(resultat.dejaCollecte)} d'offres sur les douze derniers mois. ` +
          `Le plafond réglementaire est de ${formatEur(PLAFOND_PORTEUR_12_MOIS_EUR)} ` +
          `par porteur sur douze mois glissants (art. 1(2)(c) du règlement (UE) 2020/1503). ` +
          `Marge restante : ${formatEur(resultat.disponible)}.`,
      );
    }
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
