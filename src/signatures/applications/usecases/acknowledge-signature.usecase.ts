import {
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import {
  DocumentRelatedTo,
  DocumentType,
} from 'src/documents/domains/enums/document-type.enum';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { CertificatAcceptationService } from '../certificat-acceptation.service';
import { FinalizeSignedContractUseCase } from './finalize-signed-contract.usecase';

/** Codes stables consommés par le front (page d'acceptation, mission 6). */
export const SIGNATURE_NOT_FOUND = 'SIGNATURE_NOT_FOUND';
export const SIGNATURE_NOT_OWNER = 'SIGNATURE_NOT_OWNER';
export const SIGNATURE_PROVIDER_MISMATCH = 'SIGNATURE_PROVIDER_MISMATCH';
export const SIGNATURE_EXPIRED = 'SIGNATURE_EXPIRED';
export const SIGNATURE_ALREADY_PROCESSED = 'SIGNATURE_ALREADY_PROCESSED';

export interface AcknowledgeResult {
  signatureId: string;
  requestId: string;
  statut: SignatureStatus;
  acknowledgedAt: Date | null;
  certificatDocumentId: string | null;
  investmentId: string | null;
  ordreId: string | null;
}

/**
 * Acceptation certifiée d'un contrat (provider de repli).
 *
 * Séquence : contrôles (propriété, provider, statut, échéance) → enregistrement
 * de l'acte d'acceptation (horodatage SERVEUR + IP — transition conditionnelle,
 * single-shot) → génération et archivage du certificat → règlement par le MÊME
 * `FinalizeSignedContractUseCase` que le webhook YouSign.
 *
 * Rejouable : si le règlement échoue (la signature reste PENDING), un nouvel
 * appel ne ré-enregistre pas l'acceptation et ne régénère pas le certificat —
 * il ne fait que retenter le règlement.
 */
@Injectable()
export class AcknowledgeSignatureUseCase {
  private readonly logger = new Logger(AcknowledgeSignatureUseCase.name);

  constructor(
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserEmailEntity)
    private readonly userEmailRepo: Repository<UserEmailEntity>,
    private readonly cloudStorage: CloudStorageService,
    private readonly certificat: CertificatAcceptationService,
    private readonly finalizeSignedContract: FinalizeSignedContractUseCase,
  ) {}

  async execute(
    requestId: string,
    userId: number,
    ip: string,
  ): Promise<AcknowledgeResult> {
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

    // Anti-IDOR : seul le signataire désigné peut accepter — un requestId
    // deviné ou partagé ne donne aucun droit.
    if (signature.userId !== userId) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: SIGNATURE_NOT_OWNER,
        message: "Cette demande de signature ne vous appartient pas.",
      });
    }

    // Une demande ouverte chez YouSign ne s'accepte JAMAIS par ce parcours :
    // l'accepter ici contournerait la signature électronique réellement exigée.
    if (signature.provider !== 'acknowledge') {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: SIGNATURE_PROVIDER_MISMATCH,
        message:
          'Cette demande relève du prestataire de signature électronique, pas ' +
          "du parcours d'acceptation.",
      });
    }

    const maintenant = new Date();
    if (
      signature.statut === SignatureStatus.EXPIRED ||
      (signature.statut === SignatureStatus.PENDING &&
        signature.expiresAt <= maintenant)
    ) {
      // Le balayage horaire (`SignaturesExpiryCronService`) libère l'ordre et
      // les fonds : ici on ne fait que refuser, sans doubler la compensation.
      throw new GoneException({
        statusCode: HttpStatus.GONE,
        code: SIGNATURE_EXPIRED,
        message: 'Cette demande de signature a expiré.',
      });
    }
    if (signature.statut !== SignatureStatus.PENDING) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: SIGNATURE_ALREADY_PROCESSED,
        message: 'Cette demande de signature a déjà été traitée.',
        statut: signature.statut,
      });
    }

    // ── Enregistrement de l'acte d'acceptation — single-shot ─────────────────
    // Transition conditionnelle : deux appels concurrents ne produisent qu'UN
    // enregistrement et qu'UN certificat ; le perdant retombe sur le règlement
    // (lui-même sérialisé par le verrou pessimiste du use case de règlement).
    const claim = await this.signatureRepo
      .createQueryBuilder()
      .update(SignatureEntity)
      .set({ acknowledgedAt: () => 'NOW()', acknowledgedIp: ip })
      .where('id = :id AND "acknowledgedAt" IS NULL', { id: signature.id })
      .execute();

    if (claim.affected) {
      // Relecture : l'horodatage qui figure au certificat est celui écrit en
      // base (NOW() du serveur PostgreSQL), pas une horloge applicative.
      const enregistree = await this.signatureRepo.findOneOrFail({
        where: { id: signature.id },
      });
      await this.archiverCertificat(enregistree);
    } else {
      this.logger.log(
        `Signature ${signature.id} déjà acquittée — nouvel appel = simple retentative de règlement`,
      );
    }

    // ── Règlement : le MÊME chemin que le webhook YouSign ────────────────────
    await this.finalizeSignedContract.execute(requestId);

    const finale = await this.signatureRepo.findOneOrFail({
      where: { id: signature.id },
    });
    return {
      signatureId: finale.id,
      requestId: finale.youSignRequestId,
      statut: finale.statut,
      acknowledgedAt: finale.acknowledgedAt,
      certificatDocumentId: finale.certificatDocumentId,
      investmentId: finale.investmentId,
      ordreId: finale.ordreId,
    };
  }

  /**
   * Certificat d'acceptation : généré, archivé via le module documents, lié à
   * la ligne signature. Best-effort STRICT sur rien : un certificat qui ne
   * peut pas être archivé fait échouer l'acceptation — c'est lui la preuve.
   */
  private async archiverCertificat(signature: SignatureEntity): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { userId: signature.userId },
    });
    const userEmail = await this.userEmailRepo.findOne({
      where: { userId: signature.userId },
    });
    const documentAccepte = signature.documentId
      ? await this.documentRepo.findOne({ where: { id: signature.documentId } })
      : null;

    const pdf = await this.certificat.generate({
      signatureId: signature.id,
      requestId: signature.youSignRequestId,
      signataireFirstname: user?.firstname ?? 'Investisseur',
      signataireLastname: user?.lastname ?? '',
      signataireEmail: userEmail?.email ?? '',
      signataireUserId: signature.userId,
      documentName: documentAccepte?.originalName ?? signature.documentId ?? '',
      documentHash: signature.documentHash,
      acknowledgedAt: signature.acknowledgedAt!,
      acknowledgedIp: signature.acknowledgedIp ?? '',
    });

    const filename = `certificat_acceptation_${signature.id.slice(0, 8)}_${signature.userId}_${Date.now()}.pdf`;
    const { objectName, publicUrl } = await this.cloudStorage.upload(
      pdf,
      filename,
      'application/pdf',
      'contrats',
    );
    const certDoc = await this.documentRepo.save(
      this.documentRepo.create({
        type: DocumentType.CERTIFICAT_ACCEPTATION,
        relatedTo: DocumentRelatedTo.INVESTMENT,
        userId: signature.userId,
        projectId: documentAccepte?.projectId ?? null,
        investmentId: signature.investmentId,
        originalName: filename,
        filename: objectName,
        mimeType: 'application/pdf',
        sizeBytes: pdf.length,
        path: publicUrl,
        isPublic: false,
        uploadedBy: signature.userId,
        ordre: null,
        estPrincipale: false,
      }),
    );
    await this.signatureRepo.update(
      { id: signature.id },
      { certificatDocumentId: certDoc.id },
    );
    signature.certificatDocumentId = certDoc.id;

    this.logger.log(
      `Certificat d'acceptation archivé : signature=${signature.id} document=${certDoc.id} sha256=${(signature.documentHash ?? '').slice(0, 12)}…`,
    );
  }
}
