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
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { UserRole } from 'src/iam/domain/enums/user.enum';

@Injectable()
export class ValidateLoyerEncaisseUseCase {
  constructor(
    @Inject(LOYER_ENCAISSE_REPOSITORY)
    private readonly loyerRepo: LoyerEncaisseRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async validate(id: string, adminUserId: number, adminRole?: string): Promise<LoyerEncaisse> {
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
    const saved = await this.loyerRepo.save(l);
    await this.auditLog
      .create(
        String(adminUserId),
        adminRole ?? UserRole.SUPER_ADMIN,
        'equity.loyer.validate',
        'loyer_encaisse',
        id,
        undefined,
        undefined,
        { bailId: l.bailId, periode: l.periode, montant: l.montant },
      )
      .catch(() => {});
    return saved;
  }

  async reject(
    id: string,
    adminUserId: number,
    motif: string,
    adminRole?: string,
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
    const saved = await this.loyerRepo.save(l);
    await this.auditLog
      .create(
        String(adminUserId),
        adminRole ?? UserRole.SUPER_ADMIN,
        'equity.loyer.reject',
        'loyer_encaisse',
        id,
        undefined,
        undefined,
        { bailId: l.bailId, periode: l.periode, montant: l.montant, motif: motif.trim() },
      )
      .catch(() => {});
    return saved;
  }
}
