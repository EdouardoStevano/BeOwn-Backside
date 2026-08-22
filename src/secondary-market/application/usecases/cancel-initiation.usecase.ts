import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { YouSignService } from 'src/common/yousign/yousign.service';

@Injectable()
export class CancelInitiationUseCase {
  private readonly logger = new Logger(CancelInitiationUseCase.name);

  constructor(
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    private readonly youSignService: YouSignService,
  ) {}

  async execute(signatureId: string, userId: number): Promise<void> {
    const signature = await this.signatureRepo.findOne({
      where: { id: signatureId },
    });
    if (!signature) throw new NotFoundException('Signature introuvable');
    if (signature.userId !== userId) throw new ForbiddenException('Non autorisé');
    if (signature.statut !== SignatureStatus.PENDING) return; // idempotent

    signature.statut = SignatureStatus.CANCELLED;
    await this.signatureRepo.save(signature);

    // Annuler la procédure YouSign de manière non-bloquante
    this.youSignService
      .cancelSignatureRequest(signature.youSignRequestId)
      .catch((err) =>
        this.logger.warn(
          `Could not cancel YouSign ${signature.youSignRequestId}: ${err?.message}`,
        ),
      );
  }
}
