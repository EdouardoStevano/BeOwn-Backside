import { Inject, Injectable } from '@nestjs/common';
import { Project } from 'src/catalog/domain/aggregates/project';
import { ChampsDeBloc } from 'src/catalog/domain/entities/bloc-de-contenu';
import { ProjetIntrouvableError } from 'src/catalog/domain/errors';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../../domain/repositories/project.repository';

/**
 * Les cinq gestes d'édition des blocs de contenu d'une fiche.
 *
 * Chacun fait la même chose, et rien de plus : charger le projet, appeler le
 * comportement de l'agrégat, l'enregistrer (§14). Aucune règle ici — ni la
 * validité d'un titre, ni la continuité des positions, ni l'existence du bloc
 * visé : tout cela est dans {@link BlocsDeContenu}, et doit y rester pour tenir
 * quel que soit le point d'entrée.
 *
 * **Une classe pour cinq gestes**, et non cinq classes : ce sont cinq
 * variations d'un même cas d'usage — *l'administrateur rédige la fiche* — qui
 * partagent le même chargement et la même frontière transactionnelle (§40,
 * SRP). C'est le découpage de `ManageSortieUseCase`. Ce n'est pas pour autant un
 * `ReservationService.create/update/delete` (§9) : les noms sont ceux du métier,
 * et chaque méthode délègue à une intention nommée de l'agrégat.
 */
@Injectable()
export class GererBlocsDeContenuUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  /** @param position rang visé ; à défaut, le bloc se pose en dernier. */
  async ajouter(
    projetId: string,
    champs: ChampsDeBloc,
    position?: number,
  ): Promise<Project> {
    return this.editer(projetId, (projet) =>
      projet.ajouterBloc(champs, position),
    );
  }

  async modifier(
    projetId: string,
    blocId: string,
    champs: Partial<ChampsDeBloc>,
  ): Promise<Project> {
    return this.editer(projetId, (projet) =>
      projet.modifierBloc(blocId, champs),
    );
  }

  async deplacer(
    projetId: string,
    blocId: string,
    position: number,
  ): Promise<Project> {
    return this.editer(projetId, (projet) =>
      projet.deplacerBloc(blocId, position),
    );
  }

  async reordonner(
    projetId: string,
    idsDansLOrdre: readonly string[],
  ): Promise<Project> {
    return this.editer(projetId, (projet) =>
      projet.reordonnerBlocs(idsDansLOrdre),
    );
  }

  async retirer(projetId: string, blocId: string): Promise<Project> {
    return this.editer(projetId, (projet) => projet.retirerBloc(blocId));
  }

  /**
   * Le tronc commun : charger, laisser l'agrégat décider, enregistrer.
   *
   * Si `geste` lève, on sort avant le `save` — l'agrégat en mémoire est jeté et
   * la ligne n'a pas bougé. C'est ce qui rend inutile toute annulation
   * explicite.
   */
  private async editer(
    projetId: string,
    geste: (projet: Project) => void,
  ): Promise<Project> {
    const projet = await this.projectRepository.findProjectById(projetId);
    if (!projet) throw new ProjetIntrouvableError();

    geste(projet);

    return this.projectRepository.saveProject(projet);
  }
}
