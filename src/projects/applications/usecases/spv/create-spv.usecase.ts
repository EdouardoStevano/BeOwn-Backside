import { Inject, Injectable } from '@nestjs/common';
import {
  CreerSpvProps,
  SpvFactory,
} from 'src/projects/domains/factories/spv.factory';
import { Spv } from 'src/projects/domains/spv';
import {
  SPV_REPOSITORY,
  type SpvRepository,
} from '../../ports/repositories/spv.repository';

/**
 * Constitution d'une société de projet.
 *
 * L'agrégat naissait dans `ProjectController.createSpv` — douze affectations et
 * deux valeurs par défaut, juste avant l'appel au repository, que le contrôleur
 * injectait directement (§12.5 et §12.9). Le use case n'ajoute rien à la
 * fabrique : c'est précisément ce qu'on attend de lui ici, orchestrer sans
 * décider.
 */
@Injectable()
export class CreateSpvUseCase {
  constructor(
    @Inject(SPV_REPOSITORY) private readonly spvRepository: SpvRepository,
  ) {}

  async execute(props: CreerSpvProps): Promise<Spv> {
    return this.spvRepository.saveSpv(SpvFactory.creer(props));
  }
}
