import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Bail } from '../../domains/bail';
import { StatutBail } from '../../domains/enums/statut-bail.enum';
import {
  BAIL_REPOSITORY,
  type BailRepository,
} from '../ports/repositories/bail.repository';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

@Injectable()
export class ResilierBailUseCase {
  constructor(
    @Inject(BAIL_REPOSITORY) private readonly bailRepo: BailRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(
    bailId: string,
    actorUserId: number,
    motif: string,
    finalStatus: StatutBail.TERMINE | StatutBail.RESILIE = StatutBail.RESILIE,
  ): Promise<Bail> {
    if (!motif || motif.trim().length === 0) {
      throw new BadRequestException('Motif requis.');
    }
    const bail = await this.bailRepo.findById(bailId);
    if (!bail) throw new NotFoundException('Bail introuvable.');
    if (bail.statut !== StatutBail.ACTIF) {
      throw new BadRequestException(
        `Statut actuel "${bail.statut}" — seul ACTIF peut être résilié/terminé.`,
      );
    }

    bail.statut = finalStatus;
    bail.dateFin = bail.dateFin ?? new Date();
    const saved = await this.bailRepo.save(bail);

    await this.auditLog
      .create(
        String(actorUserId),
        UserRole.PORTEUR,
        finalStatus === StatutBail.TERMINE
          ? 'equity.bail.terminate'
          : 'equity.bail.resilier',
        'bail',
        bailId,
        undefined,
        undefined,
        {
          uniteLouableId: bail.uniteLouableId,
          locataireId: bail.locataireId,
          motif: motif.trim(),
        },
      )
      .catch(() => {});

    return saved;
  }
}
