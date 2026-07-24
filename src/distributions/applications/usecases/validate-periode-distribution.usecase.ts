import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PeriodeDistribution } from '../../domains/periode-distribution';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import {
  PERIODE_DISTRIBUTION_REPOSITORY,
  type PeriodeDistributionRepository,
} from '../ports/repositories/periode-distribution.repository';

@Injectable()
export class ValidatePeriodeDistributionUseCase {
  constructor(
    @Inject(PERIODE_DISTRIBUTION_REPOSITORY)
    private readonly periodeRepo: PeriodeDistributionRepository,
  ) {}

  async validate(id: string): Promise<PeriodeDistribution> {
    const p = await this.periodeRepo.findById(id);
    if (!p) throw new NotFoundException('Période de distribution introuvable.');
    if (p.statut !== StatutPeriodeDistribution.CALCULEE) {
      throw new BadRequestException(
        `Statut actuel "${p.statut}" — seul CALCULEE peut être validé.`,
      );
    }
    p.statut = StatutPeriodeDistribution.VALIDEE;
    p.valideeLe = new Date();
    return this.periodeRepo.save(p);
  }

  /**
   * Annule une période CALCULEE ou VALIDEE. Ce flux existe et ne touche
   * JAMAIS aux wallets/transactions : les frais plateforme (fraisPlateforme
   * Annuel/fraisGestionLocative) sont calculés et persistés sur la période
   * dès le calcul, mais ne sont ENCAISSÉS (crédit wallet + ledger) qu'à
   * l'exécution (voir ExecuteDistributionUseCase). Une période CALCULEE ou
   * VALIDEE n'a donc jamais rien prélevé — il n'y a rien à reverser ici,
   * par construction, pas par omission.
   */
  async cancel(id: string): Promise<PeriodeDistribution> {
    const p = await this.periodeRepo.findById(id);
    if (!p) throw new NotFoundException('Période de distribution introuvable.');
    if (
      p.statut !== StatutPeriodeDistribution.CALCULEE &&
      p.statut !== StatutPeriodeDistribution.VALIDEE
    ) {
      throw new BadRequestException(
        `Statut actuel "${p.statut}" — distribution déjà exécutée, annulation impossible.`,
      );
    }
    p.statut = StatutPeriodeDistribution.ANNULEE;
    return this.periodeRepo.save(p);
  }
}
