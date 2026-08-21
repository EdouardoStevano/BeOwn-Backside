import { Inject, Injectable } from '@nestjs/common';
import { Spv } from 'src/projects/domains/spv';
import {
  SPV_REPOSITORY,
  type SpvRepository,
} from '../../ports/repositories/spv.repository';

/** Liste des sociétés de projet, pour les écrans d'administration. */
@Injectable()
export class ListSpvUseCase {
  constructor(
    @Inject(SPV_REPOSITORY) private readonly spvRepository: SpvRepository,
  ) {}

  async execute(): Promise<Spv[]> {
    return this.spvRepository.findAllSpv();
  }
}
