import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Charge } from '../../domains/charge';
import { StatutDeclaration } from '../../domains/enums/statut-declaration.enum';
import {
  CHARGE_REPOSITORY,
  type ChargeRepository,
} from '../ports/repositories/charge.repository';

@Injectable()
export class ValidateChargeUseCase {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly chargeRepo: ChargeRepository,
  ) {}

  async validate(id: string, adminUserId: number): Promise<Charge> {
    const c = await this.chargeRepo.findById(id);
    if (!c) throw new NotFoundException('Charge introuvable.');
    if (c.statut !== StatutDeclaration.DECLARE) {
      throw new BadRequestException(
        `Statut actuel "${c.statut}" — seul DECLARE peut être validé.`,
      );
    }
    c.statut = StatutDeclaration.VALIDE;
    c.valideParUserId = adminUserId;
    c.valideLe = new Date();
    c.motifRejet = null;
    return this.chargeRepo.save(c);
  }

  async reject(
    id: string,
    adminUserId: number,
    motif: string,
  ): Promise<Charge> {
    if (!motif || motif.trim().length === 0) {
      throw new BadRequestException('Motif de rejet requis.');
    }
    const c = await this.chargeRepo.findById(id);
    if (!c) throw new NotFoundException('Charge introuvable.');
    if (c.statut !== StatutDeclaration.DECLARE) {
      throw new BadRequestException(
        `Statut actuel "${c.statut}" — seul DECLARE peut être rejeté.`,
      );
    }
    c.statut = StatutDeclaration.REJETE;
    c.valideParUserId = adminUserId;
    c.valideLe = new Date();
    c.motifRejet = motif.trim();
    return this.chargeRepo.save(c);
  }
}
