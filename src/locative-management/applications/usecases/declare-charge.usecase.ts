import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Charge } from '../../domains/charge';
import { StatutDeclaration } from '../../domains/enums/statut-declaration.enum';
import { TypeCharge } from '../../domains/enums/type-charge.enum';
import {
  CHARGE_REPOSITORY,
  type ChargeRepository,
} from '../ports/repositories/charge.repository';

export interface DeclareChargeInput {
  projetId: string;
  type: TypeCharge;
  description: string;
  montant: number;
  periode: string;
  dateOperation: Date;
  justificatifs: string[];
  declareParUserId: number;
}

const PERIODE_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

@Injectable()
export class DeclareChargeUseCase {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly chargeRepo: ChargeRepository,
  ) {}

  async execute(input: DeclareChargeInput): Promise<Charge> {
    if (!PERIODE_REGEX.test(input.periode)) {
      throw new BadRequestException(
        'Format période invalide (YYYY-MM attendu).',
      );
    }
    if (input.montant <= 0) {
      throw new BadRequestException('Le montant doit être positif.');
    }
    if (!input.justificatifs || input.justificatifs.length === 0) {
      throw new BadRequestException('Au moins un justificatif est requis.');
    }

    const c = new Charge();
    c.projetId = input.projetId;
    c.type = input.type;
    c.description = input.description;
    c.montant = input.montant;
    c.periode = input.periode;
    c.dateOperation = input.dateOperation;
    c.justificatifs = input.justificatifs;
    c.statut = StatutDeclaration.DECLARE;
    c.declareParUserId = input.declareParUserId;
    c.valideParUserId = null;
    c.valideLe = null;
    c.motifRejet = null;
    return this.chargeRepo.save(c);
  }
}
