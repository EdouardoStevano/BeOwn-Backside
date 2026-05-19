import { Inject, Injectable } from '@nestjs/common';
import {
  UNITE_LOUABLE_REPOSITORY,
  type UniteLouableRepository,
} from '../ports/repositories/unite-louable.repository';
import {
  BAIL_REPOSITORY,
  type BailRepository,
} from '../ports/repositories/bail.repository';

export interface ProjectOccupation {
  projetId: string;
  nbUnitesTotal: number;
  nbUnitesLouees: number;
  tauxOccupation: number; // 0..1
}

@Injectable()
export class GetProjectOccupationUseCase {
  constructor(
    @Inject(UNITE_LOUABLE_REPOSITORY)
    private readonly uniteRepo: UniteLouableRepository,
    @Inject(BAIL_REPOSITORY) private readonly bailRepo: BailRepository,
  ) {}

  async execute(projetId: string): Promise<ProjectOccupation> {
    const unites = await this.uniteRepo.findByProjet(projetId);
    const baux = await this.bailRepo.findActifsByProjet(projetId);
    const idsLouees = new Set(baux.map((b) => b.uniteLouableId));
    const nbUnitesLouees = unites.filter((u) => idsLouees.has(u.id)).length;
    const tauxOccupation =
      unites.length === 0 ? 0 : nbUnitesLouees / unites.length;
    return {
      projetId,
      nbUnitesTotal: unites.length,
      nbUnitesLouees,
      tauxOccupation: Math.round(tauxOccupation * 10000) / 10000,
    };
  }
}
