import { Inject, Injectable } from '@nestjs/common';
import {
  AVIS_REPOSITORY,
  type AvisRepository,
} from 'src/catalog/domain/repositories/avis.repository';
import { Avis, type AvisSnapshot } from 'src/catalog/domain/aggregates/avis';
import {
  AvisDejaSoumisError,
  AvisIntrouvableError,
  ProjetIntrouvableError,
} from 'src/catalog/domain/errors';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../../domain/repositories/project.repository';

export interface DepotAvis {
  projetId: string;
  utilisateurId: number;
  note: number;
  commentaire?: string | null;
}

/**
 * Les écritures d'avis (§11) — déposer le sien, y revenir.
 *
 * Le use case orchestre, il ne décide pas (§14). Ce qui lui appartient en
 * propre, c'est **l'éligibilité du projet** : elle porte sur le projet, que
 * l'agrégat `Avis` ne connaît pas, et il est le seul à avoir les deux sous la
 * main. La validité de la note et la propriété de l'avis sont, elles, dans
 * l'agrégat.
 *
 * Il réunit deux chemins d'écriture qui existaient en parallèle et
 * n'appliquaient pas les mêmes règles : `POST /projects/:id/avis` exigeait un
 * projet ouvert aux investisseurs, `POST /avis/projet/:projetId` non — et
 * `POST /avis/projet/:projetId/update` n'exigeait rien du tout. Les deux
 * fabriquaient l'agrégat à la main, chacun dans son contrôleur (§12.5).
 *
 * > ⚠️ Changement de comportement assumé : déposer ou modifier un avis sur un
 * > projet qui n'est pas ouvert aux investisseurs répond désormais comme un
 * > projet inexistant, quelle que soit la route empruntée.
 */
@Injectable()
export class DeposerAvisProjetUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(AVIS_REPOSITORY)
    private readonly avisRepository: AvisRepository,
  ) {}

  /** Dépose l'avis d'un compte sur un projet — un seul par compte et par projet. */
  async deposer(depot: DepotAvis): Promise<AvisSnapshot> {
    await this.assertProjetNotable(depot.projetId);

    const existant = await this.avisRepository.findByUserAndProjet(
      depot.utilisateurId,
      depot.projetId,
    );
    if (existant) throw new AvisDejaSoumisError();

    const depose = await this.avisRepository.creer(Avis.deposer(depot));
    return depose.snapshot();
  }

  /** L'auteur revient sur l'avis qu'il a déposé sur ce projet. */
  async modifier(depot: DepotAvis): Promise<AvisSnapshot> {
    await this.assertProjetNotable(depot.projetId);

    const avis = await this.avisRepository.findByUserAndProjet(
      depot.utilisateurId,
      depot.projetId,
    );
    if (!avis) throw new AvisIntrouvableError();

    avis.modifierPar(depot.utilisateurId, depot.note, depot.commentaire);

    const enregistre = await this.avisRepository.save(avis);
    return enregistre.snapshot();
  }

  private async assertProjetNotable(projetId: string): Promise<void> {
    const projet = await this.projectRepository.findProjectById(projetId);
    if (!projet || !projet.estOuvertAuxInvestisseurs()) {
      throw new ProjetIntrouvableError();
    }
  }
}
