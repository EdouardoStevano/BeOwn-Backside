import { Inject, Injectable } from '@nestjs/common';
import {
  LOYER_ENCAISSE_REPOSITORY,
  type LoyerEncaisseRepository,
} from '../ports/repositories/loyer-encaisse.repository';
import {
  CHARGE_REPOSITORY,
  type ChargeRepository,
} from '../ports/repositories/charge.repository';

export interface EtatFinancierPeriode {
  periode: string;
  totalLoyers: number;
  totalCharges: number;
  revenuNet: number;
}

@Injectable()
export class GetProjectEtatFinancierUseCase {
  constructor(
    @Inject(LOYER_ENCAISSE_REPOSITORY)
    private readonly loyerRepo: LoyerEncaisseRepository,
    @Inject(CHARGE_REPOSITORY) private readonly chargeRepo: ChargeRepository,
  ) {}

  async execute(
    projetId: string,
    periode: string,
  ): Promise<EtatFinancierPeriode> {
    const [loyers, charges] = await Promise.all([
      this.loyerRepo.findValidesParProjetEtPeriode(projetId, periode),
      this.chargeRepo.findValidesParProjetEtPeriode(projetId, periode),
    ]);
    const totalLoyers = loyers.reduce((s, l) => s + l.montant, 0);
    const totalCharges = charges.reduce((s, c) => s + c.montant, 0);
    return {
      periode,
      totalLoyers: Math.round(totalLoyers * 100) / 100,
      totalCharges: Math.round(totalCharges * 100) / 100,
      revenuNet: Math.round((totalLoyers - totalCharges) * 100) / 100,
    };
  }
}
