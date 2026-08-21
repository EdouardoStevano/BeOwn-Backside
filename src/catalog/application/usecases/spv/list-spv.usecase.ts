import { Inject, Injectable } from '@nestjs/common';
import { Spv } from 'src/catalog/domain/aggregates/spv';
import {
  SPV_REPOSITORY,
  type SpvRepository,
} from '../../../domain/repositories/spv.repository';

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
