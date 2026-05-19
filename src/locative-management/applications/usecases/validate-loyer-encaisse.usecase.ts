import {
  BadRequestException,
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

@Injectable()
export class ValidateLoyerEncaisseUseCase {
  constructor(
    @Inject(LOYER_ENCAISSE_REPOSITORY)
    private readonly loyerRepo: LoyerEncaisseRepository,
  ) {}

  async validate(id: string, adminUserId: number): Promise<LoyerEncaisse> {
    const l = await this.loyerRepo.findById(id);
    if (!l) throw new NotFoundException('Loyer introuvable.');
    if (l.statut !== StatutDeclaration.DECLARE) {
      throw new BadRequestException(
        `Statut actuel "${l.statut}" — seul DECLARE peut être validé.`,
      );
    }
    l.statut = StatutDeclaration.VALIDE;
    l.valideParUserId = adminUserId;
    l.valideLe = new Date();
    l.motifRejet = null;
    return this.loyerRepo.save(l);
  }

  async reject(
    id: string,
    adminUserId: number,
    motif: string,
  ): Promise<LoyerEncaisse> {
    if (!motif || motif.trim().length === 0) {
      throw new BadRequestException('Motif de rejet requis.');
    }
    const l = await this.loyerRepo.findById(id);
    if (!l) throw new NotFoundException('Loyer introuvable.');
    if (l.statut !== StatutDeclaration.DECLARE) {
      throw new BadRequestException(
        `Statut actuel "${l.statut}" — seul DECLARE peut être rejeté.`,
      );
    }
    l.statut = StatutDeclaration.REJETE;
    l.valideParUserId = adminUserId;
    l.valideLe = new Date();
    l.motifRejet = motif.trim();
    return this.loyerRepo.save(l);
  }
}
