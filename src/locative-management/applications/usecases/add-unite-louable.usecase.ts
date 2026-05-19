import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { UniteLouable } from '../../domains/unite-louable';
import {
  UNITE_LOUABLE_REPOSITORY,
  type UniteLouableRepository,
} from '../ports/repositories/unite-louable.repository';

export interface AddUniteLouableInput {
  projetId: string;
  reference: string;
  surfaceM2: number | null;
  loyerMensuelCible: number;
}

@Injectable()
export class AddUniteLouableUseCase {
  constructor(
    @Inject(UNITE_LOUABLE_REPOSITORY)
    private readonly uniteRepo: UniteLouableRepository,
  ) {}

  async execute(input: AddUniteLouableInput): Promise<UniteLouable> {
    if (input.loyerMensuelCible <= 0) {
      throw new BadRequestException(
        'Le loyer mensuel cible doit être positif.',
      );
    }
    const u = new UniteLouable();
    u.projetId = input.projetId;
    u.reference = input.reference;
    u.surfaceM2 = input.surfaceM2;
    u.loyerMensuelCible = input.loyerMensuelCible;
    return this.uniteRepo.save(u);
  }
}
