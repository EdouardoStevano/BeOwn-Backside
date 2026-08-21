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
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { UserRole } from 'src/iam/domain/enums/user.enum';

@Injectable()
export class ValidateChargeUseCase {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly chargeRepo: ChargeRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async validate(id: string, adminUserId: number, adminRole?: string): Promise<Charge> {
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
    const saved = await this.chargeRepo.save(c);
    await this.auditLog
      .create(
        String(adminUserId),
        adminRole ?? UserRole.SUPER_ADMIN,
        'equity.charge.validate',
        'charge',
        id,
        undefined,
        undefined,
        { projetId: c.projetId, periode: c.periode, type: c.type, montant: c.montant },
      )
      .catch(() => {});
    return saved;
  }

  async reject(
    id: string,
    adminUserId: number,
    motif: string,
    adminRole?: string,
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
    const saved = await this.chargeRepo.save(c);
    await this.auditLog
      .create(
        String(adminUserId),
        adminRole ?? UserRole.SUPER_ADMIN,
        'equity.charge.reject',
        'charge',
        id,
        undefined,
        undefined,
        { projetId: c.projetId, periode: c.periode, type: c.type, montant: c.montant, motif: motif.trim() },
      )
      .catch(() => {});
    return saved;
  }
}
