import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignatureEntity } from 'src/documents/infrastructure/persistence/entities/signature.entity';
import { SignatureOrmMapper } from 'src/documents/infrastructure/persistence/mappers/signature.orm-mapper';
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
    const ligne = await this.signatureRepo.findOne({
      where: { id: signatureId },
    });
    if (!ligne) throw new NotFoundException('Signature introuvable');

    // La règle « on n'annule qu'une demande encore en attente, et seulement la
    // sienne » appartient à `documents` : ici on interroge pour rester
    // idempotent, puis on laisse l'entité trancher.
    const signature = SignatureOrmMapper.toDomain(ligne);
    if (!signature.estEnAttente) return; // idempotent
    signature.annuler(userId);

    await this.signatureRepo.save(
      SignatureOrmMapper.appliquerSur(ligne, signature),
    );

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
