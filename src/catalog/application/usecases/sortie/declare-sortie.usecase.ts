import { Inject, Injectable } from '@nestjs/common';
import { ModeleEconomique } from 'src/catalog/domain/enums/modele-economique.enum';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import {
  ModeleEconomiqueNonEquityError,
  ProjetIntrouvableError,
  ProjetNonFinanceError,
  SortieDejaEnCoursError,
} from 'src/catalog/domain/errors';
import { SortieProjetFactory } from 'src/catalog/domain/factories/sortie-projet.factory';
import { SortieProjet } from 'src/catalog/domain/aggregates/sortie-projet';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../../domain/repositories/project.repository';
import {
  SORTIE_PROJET_REPOSITORY,
  type SortieProjetRepository,
} from '../../../domain/repositories/sortie-projet.repository';

export interface DeclareSortieInput {
  projetId: string;
  prixRevente: number;
  dateRevente: Date;
  acteVentePdfUrl?: string | null;
}

/**
 * Déclaration d'une sortie : la revente du bien détenu par la SCI.
 *
 * Le use case garde ce qui suppose de lire la base — l'éligibilité du projet et
 * l'absence d'une sortie déjà vivante — et délègue le reste à
 * {@link SortieProjetFactory} : le calcul de la plus-value et le statut de
 * départ, qui étaient calculés ici à côté d'un `round2` privé.
 */
@Injectable()
export class DeclareSortieUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: ProjectRepository,
    @Inject(SORTIE_PROJET_REPOSITORY)
    private readonly sortieRepo: SortieProjetRepository,
  ) {}

  async execute(input: DeclareSortieInput): Promise<SortieProjet> {
    const projet = await this.projectRepo.findProjectById(input.projetId);
    if (!projet) throw new ProjetIntrouvableError();

    if (projet.modeleEconomique !== ModeleEconomique.EQUITY) {
      throw new ModeleEconomiqueNonEquityError(projet.modeleEconomique);
    }
    if (projet.statut !== ProjectStatus.FINANCE) {
      throw new ProjetNonFinanceError(projet.statut);
    }

    const enCours = (await this.sortieRepo.findByProjet(input.projetId)).find(
      (sortie) => sortie.occupeLeProjet,
    );
    if (enCours) throw new SortieDejaEnCoursError(enCours.statut);

    return this.sortieRepo.save(
      SortieProjetFactory.declarer({
        projetId: input.projetId,
        prixRevente: input.prixRevente,
        dateRevente: input.dateRevente,
        capitalCible: projet.capitalCible,
        acteVentePdfUrl: input.acteVentePdfUrl,
      }),
    );
  }
}
