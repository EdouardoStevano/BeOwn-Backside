import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LoyerEncaisse } from '../../domains/loyer-encaisse';
import { StatutDeclaration } from '../../domains/enums/statut-declaration.enum';
import {
  LOYER_ENCAISSE_REPOSITORY,
  type LoyerEncaisseRepository,
} from '../ports/repositories/loyer-encaisse.repository';
import {
  BAIL_REPOSITORY,
  type BailRepository,
} from '../ports/repositories/bail.repository';

export interface DeclareLoyerInput {
  bailId: string;
  periode: string; // 'YYYY-MM'
  montant: number;
  dateEncaissement: Date;
  preuves: string[];
  declareParUserId: number;
}

const PERIODE_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

@Injectable()
export class DeclareLoyerEncaisseUseCase {
  constructor(
    @Inject(LOYER_ENCAISSE_REPOSITORY)
    private readonly loyerRepo: LoyerEncaisseRepository,
    @Inject(BAIL_REPOSITORY) private readonly bailRepo: BailRepository,
  ) {}

  async execute(input: DeclareLoyerInput): Promise<LoyerEncaisse> {
    if (!PERIODE_REGEX.test(input.periode)) {
      throw new BadRequestException(
        'Format période invalide (YYYY-MM attendu).',
      );
    }
    if (input.montant <= 0) {
      throw new BadRequestException('Le montant doit être positif.');
    }
    if (!input.preuves || input.preuves.length === 0) {
      throw new BadRequestException(
        'Au moins une preuve (relevé bancaire/quittance) est requise.',
      );
    }

    const bail = await this.bailRepo.findById(input.bailId);
    if (!bail) throw new NotFoundException('Bail introuvable.');

    const existing = await this.loyerRepo.findByBailEtPeriode(
      input.bailId,
      input.periode,
    );
    if (existing) {
      throw new ConflictException(
        'Un loyer est déjà déclaré pour ce bail sur cette période.',
      );
    }

    const l = new LoyerEncaisse();
    l.bailId = input.bailId;
    l.periode = input.periode;
    l.montant = input.montant;
    l.dateEncaissement = input.dateEncaissement;
    l.preuves = input.preuves;
    l.statut = StatutDeclaration.DECLARE;
    l.declareParUserId = input.declareParUserId;
    l.valideParUserId = null;
    l.valideLe = null;
    l.motifRejet = null;
    return this.loyerRepo.save(l);
  }
}
