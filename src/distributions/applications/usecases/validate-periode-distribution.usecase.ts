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
