import { Injectable } from '@nestjs/common';
import {
  ProjectStatus,
  ProjectType,
} from 'src/catalog/domain/enums/project-status.enum';
import { StatutProjet } from 'src/catalog/domain/value-objects/statut-projet.vo';
import {
  ProjetEnListe,
  ProjetEnListeAvecImages,
  ProjectReadModelService,
} from '../../services/project-read-model.service';
import { GetProjectsUseCase } from './get-projects.usecase';

export interface PaginationProjets {
  page?: number;
  limit?: number;
}

export interface ListeProjets<T> {
  data: T[];
  total: number;
}

/**
 * Les deux listes du catalogue : celle du site public et celle du back-office.
 *
 * Les compositions vivaient dans `ProjectController` — la liste des statuts
 * publics écrite en dur, puis deux enrichissements chaînés à la main. Elles
 * n'ont rien de HTTP : c'est de l'orchestration, donc de l'applicatif (§12.5).
 *
 * Un seul use case pour les deux, parce qu'ils lisent la même chose et ne
 * diffèrent que par le filtre et le niveau d'enrichissement — les séparer
 * dupliquerait la composition sans séparer aucune raison de changer.
 */
@Injectable()
export class ListProjectsUseCase {
  constructor(
    private readonly getProjects: GetProjectsUseCase,
    private readonly readModel: ProjectReadModelService,
  ) {}

  /**
   * Projets ouverts aux investisseurs, avec leurs photos.
   *
   * La liste des statuts vient de {@link StatutProjet} : elle était réécrite
   * ici, et différemment des trois autres endroits du contrôleur qui en
   * énuméraient une.
   */
  async executePublic(
    filtres: PaginationProjets & { type?: ProjectType } = {},
  ): Promise<ListeProjets<ProjetEnListeAvecImages>> {
    const { data, total } = await this.getProjects.execute({
      statuts: [...StatutProjet.statutsPublics],
      type: filtres.type,
      page: filtres.page,
      limit: filtres.limit,
    });

    return {
      data: await this.readModel.enrichImages(
        await this.readModel.enrichFractions(data),
      ),
      total,
    };
  }

  /** Liste d'administration : tous statuts, sans les photos. */
  async executeAdmin(
    filtres: PaginationProjets & {
      statut?: ProjectStatus;
      type?: ProjectType;
    } = {},
  ): Promise<ListeProjets<ProjetEnListe>> {
    const { data, total } = await this.getProjects.execute(filtres);
    return { data: await this.readModel.enrichFractions(data), total };
  }
}
