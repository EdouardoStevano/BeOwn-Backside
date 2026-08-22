import { Inject, Injectable } from '@nestjs/common';
import {
  AVIS_REPOSITORY,
  type AvisRepository,
} from 'src/catalog/domain/repositories/avis.repository';
import type { AvisSnapshot } from 'src/catalog/domain/aggregates/avis';
import { ProjetIntrouvableError } from 'src/catalog/domain/errors';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../../domain/repositories/project.repository';

export interface AvisProjet {
  noteMoyenne: number;
  nbAvis: number;
  avis: AvisSnapshot[];
}

export interface StatsAvisProjet {
  noteMoyenne: number;
  nbAvis: number;
}

/**
 * Les lectures d'avis d'un projet (§11) — la liste, les statistiques, et
 * l'avis d'un compte donné.
 *
 * **Toutes passent par la même garde**, et c'est le sens de ce use case : un
 * projet qui n'est pas ouvert aux investisseurs répond comme un projet
 * inexistant. La liste des avis ne doit pas renseigner sur l'existence d'un
 * dossier qui n'est pas public.
 *
 * Cette garde n'existait que sur `GET /projects/:id/avis`. `AvisController`
 * servait les mêmes données sur `/avis/projet/:projetId`, en `@Public()` et
 * sans aucun filtre : on pouvait donc confirmer l'existence d'un brouillon ou
 * d'un projet annulé en listant ses avis. Les deux familles de routes
 * appellent désormais ce use case.
 *
 * Il rend des snapshots, pas des agrégats : ce sont des read models, et un
 * agrégat a des champs privés que `JSON.stringify` ne sait pas rendre.
 */
@Injectable()
export class ConsultAvisProjetUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(AVIS_REPOSITORY)
    private readonly avisRepository: AvisRepository,
  ) {}

  /** Avis et note moyenne d'un projet ouvert aux investisseurs. */
  async lister(projetId: string): Promise<AvisProjet> {
    await this.assertProjetConsultable(projetId);

    const [avis, stats] = await Promise.all([
      this.avisRepository.findByProjetId(projetId),
      this.avisRepository.getStats(projetId),
    ]);
    return { ...stats, avis: avis.map((a) => a.snapshot()) };
  }

  /** Note moyenne et nombre d'avis, sans les avis eux-mêmes. */
  async statistiques(projetId: string): Promise<StatsAvisProjet> {
    await this.assertProjetConsultable(projetId);

    return this.avisRepository.getStats(projetId);
  }

  /** L'avis d'un compte sur un projet, ou `null` s'il n'en a pas déposé. */
  async avisDuCompte(
    projetId: string,
    utilisateurId: number,
  ): Promise<AvisSnapshot | null> {
    await this.assertProjetConsultable(projetId);

    const avis = await this.avisRepository.findByUserAndProjet(
      utilisateurId,
      projetId,
    );
    return avis?.snapshot() ?? null;
  }

  private async assertProjetConsultable(projetId: string): Promise<void> {
    const projet = await this.projectRepository.findProjectById(projetId);
    if (!projet || !projet.estOuvertAuxInvestisseurs()) {
      throw new ProjetIntrouvableError();
    }
  }
}
