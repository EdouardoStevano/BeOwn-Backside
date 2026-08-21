import { Inject, Injectable } from '@nestjs/common';
import { ProjetIntrouvableError } from 'src/projects/domains/errors';
import {
  PROJECT_SHARE_TOKENIZER,
  type ProjectShareTokenizer,
} from '../../ports/project-share-tokenizer.port';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../ports/repositories/project.repository';
import { LienPartageInvalideError } from 'src/projects/domains/errors';
import { StatutProjet } from 'src/projects/domains/value-objects/statut-projet.vo';
import {
  ProjetDetaille,
  ProjectReadModelService,
} from '../../services/project-read-model.service';
import { RecordProjectViewUseCase } from './record-project-view.usecase';

/**
 * Les quatre façons de consulter la fiche d'un projet, et ce que chacune a le
 * droit de voir.
 *
 * Elles étaient quatre méthodes de `ProjectController`, chacune avec sa propre
 * garde de visibilité écrite en `if` — et pas toujours la même : la vue
 * investisseur et la vue par slug excluaient le brouillon, la vue par jeton de
 * partage énumérait trois statuts, la liste publique quatre. Les gardes vivent
 * maintenant dans `StatutProjet`, et les quatre chemins passent par le même
 * endroit.
 *
 * Réunis dans un seul use case parce qu'ils répondent tous à la même question —
 * *cette fiche, vue par qui ?* — et changeraient donc pour la même raison
 * (§5, CCP). Ce qui diffère d'un chemin à l'autre tient en une garde et un
 * niveau de détail.
 */
@Injectable()
export class ConsultProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_SHARE_TOKENIZER)
    private readonly tokenizer: ProjectShareTokenizer,
    private readonly readModel: ProjectReadModelService,
    private readonly recordView: RecordProjectViewUseCase,
  ) {}

  /**
   * Vue d'administration : la fiche entière, documents internes compris.
   *
   * Aucune garde de statut — l'accès est déjà restreint par la permission
   * `projects:read`, et c'est le seul chemin qui montre un brouillon.
   */
  async executePourAdmin(id: string): Promise<ProjetDetaille> {
    return this.readModel.buildProjectDetail(id, false);
  }

  /**
   * Vue d'un investisseur authentifié : la fiche publique, et la consultation
   * est tracée.
   *
   * Le traçage est volontairement lancé **avant** la composition de la fiche et
   * attendu : il ne peut pas échouer bruyamment (voir
   * {@link RecordProjectViewUseCase}), et le faire d'abord garantit qu'une
   * consultation servie est une consultation comptée.
   */
  async executePourInvestisseur(
    id: string,
    utilisateurId: number,
  ): Promise<ProjetDetaille> {
    const projet = await this.projectRepository.findProjectById(id);
    if (!projet || projet.estBrouillon()) throw new ProjetIntrouvableError();

    await this.recordView.execute(utilisateurId, id, projet.titre);
    return this.readModel.buildProjectDetail(id, true);
  }

  /**
   * Vue publique par slug.
   *
   * Un brouillon — soumis par un porteur, pas encore validé ni publié — ne doit
   * pas être exposé par son slug : celui-ci est dérivé du titre, donc devinable.
   * L'admin et le porteur consultent le dossier par son identifiant (uuid non
   * devinable) ou depuis leurs espaces dédiés.
   */
  async executeParSlug(slug: string): Promise<ProjetDetaille> {
    const projet = await this.projectRepository.findProjectBySlug(slug);
    if (!projet || projet.estBrouillon()) throw new ProjetIntrouvableError();

    return this.readModel.buildProjectDetail(projet.id, true);
  }

  /**
   * Vue publique par jeton de partage.
   *
   * Le jeton est un condensat de l'identifiant : il ne s'inverse pas, il se
   * recalcule. La recherche reste donc un balayage des projets ouverts aux
   * investisseurs — mais de leurs **identifiants** seuls, et de tous, là où le
   * contrôleur chargeait mille projets entiers (`limit: 1000`). Au-delà de ce
   * millier, les liens cessaient de fonctionner sans que rien ne le signale.
   */
  async executeParJetonDePartage(token: string): Promise<ProjetDetaille> {
    const candidats = await this.projectRepository.findProjectIdsByStatuts([
      ...StatutProjet.statutsOuvertsAuxInvestisseurs,
    ]);

    const projetId = candidats.find((id) =>
      this.tokenizer.correspond(token, id),
    );
    // Jeton illisible, projet retiré du catalogue : même réponse. Un lien de
    // partage ne doit rien révéler de ce qu'il ne désigne pas.
    if (!projetId) throw new LienPartageInvalideError();

    return this.readModel.buildProjectDetail(projetId, true);
  }
}
