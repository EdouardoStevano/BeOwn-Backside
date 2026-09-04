import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { round2 } from 'src/common/platform-fees/platform-fees.constants';
import {
  SIGNATURE_NOT_FOUND,
  SIGNATURE_NOT_OWNER,
} from './acknowledge-signature.usecase';

export interface SignatureContext {
  signatureId: string;
  requestId: string;
  provider: string;
  statut: SignatureStatus;
  expiresAt: Date;
  acknowledgedAt: Date | null;
  certificatDocumentId: string | null;
  nbFractions: number | null;
  prixUnitaire: number | null;
  montantTotal: number | null;
  projetTitre: string | null;
  /** URL signée courte durée vers le PDF à accepter (jamais persistée). */
  documentUrl: string | null;
  documentName: string | null;
}

/**
 * Récapitulatif servi à la page front d'acceptation
 * (`/dashboard/signatures/:requestId/acknowledge`, mission 6) : le document à
 * lire, le contexte de la cession et l'état de la demande. Lecture seule,
 * réservée au signataire (anti-IDOR identique à l'acknowledge).
 */
@Injectable()
export class GetSignatureContextUseCase {
  constructor(
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    private readonly cloudStorage: CloudStorageService,
  ) {}

  async execute(requestId: string, userId: number): Promise<SignatureContext> {
    const signature = await this.signatureRepo.findOne({
      where: { youSignRequestId: requestId },
    });
    if (!signature) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: SIGNATURE_NOT_FOUND,
        message: 'Demande de signature introuvable.',
      });
    }
    if (signature.userId !== userId) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: SIGNATURE_NOT_OWNER,
        message: "Cette demande de signature ne vous appartient pas.",
      });
    }

    // Contexte cession (marché secondaire) — null sur une souscription initiale.
    let prixUnitaire: number | null = null;
    let projetTitre: string | null = null;
    if (signature.ordreId) {
      const ordre = await this.ordreRepo.findOne({
        where: { id: signature.ordreId },
        relations: ['investissement'],
      });
      if (ordre) {
        prixUnitaire = Number(ordre.prixUnitaire);
        const projet = await this.projectRepo.findOne({
          where: { id: ordre.investissement.projetId },
        });
        projetTitre = projet?.titre ?? null;
      }
    }

    let documentUrl: string | null = null;
    let documentName: string | null = null;
    const document = signature.documentId
      ? await this.documentRepo.findOne({ where: { id: signature.documentId } })
      : null;
    if (document) {
      documentName = document.originalName;
      const publicId = this.cloudStorage.isObjectName(document.path)
        ? document.path
        : document.filename;
      documentUrl = await this.cloudStorage.getSignedUrl(publicId, 60, 'raw');
    }

    const nbFractions = signature.nbFractions;
    return {
      signatureId: signature.id,
      requestId: signature.youSignRequestId,
      provider: signature.provider,
      statut: signature.statut,
      expiresAt: signature.expiresAt,
      acknowledgedAt: signature.acknowledgedAt,
      certificatDocumentId: signature.certificatDocumentId,
      nbFractions,
      prixUnitaire,
      montantTotal:
        nbFractions != null && prixUnitaire != null
          ? round2(nbFractions * prixUnitaire)
          : null,
      projetTitre,
      documentUrl,
      documentName,
    };
  }
}
