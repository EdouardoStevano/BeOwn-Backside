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

export interface LienDePartage {
  shareToken: string;
  shareUrl: string;
}

/**
 * Rend le lien de partage d'un projet.
 *
 * Le contrôleur composait le jeton lui-même : lecture de la variable
 * d'environnement, `createHash('sha256')`, troncature, concaténation avec
 * `FRONTEND_URL` (§12.5). Tout cela est passé derrière
 * {@link ProjectShareTokenizer} ; il ne reste ici que l'existence du projet.
 */
@Injectable()
export class GetProjectShareLinkUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_SHARE_TOKENIZER)
    private readonly tokenizer: ProjectShareTokenizer,
  ) {}

  async execute(projetId: string): Promise<LienDePartage> {
    const projet = await this.projectRepository.findProjectById(projetId);
    if (!projet) throw new ProjetIntrouvableError();

    const shareToken = this.tokenizer.tokenPour(projet.id);
    return { shareToken, shareUrl: this.tokenizer.urlPour(shareToken) };
  }
}
