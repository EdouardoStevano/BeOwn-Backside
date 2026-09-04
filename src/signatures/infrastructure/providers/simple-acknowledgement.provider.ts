import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import {
  CreateEmbeddedSignatureParams,
  EmbeddedSignatureResult,
  SignatureProvider,
} from 'src/signatures/applications/ports/signature-provider.port';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';

/**
 * Provider de repli « acceptation certifiée » (`SIGNATURE_PROVIDER=acknowledge`).
 *
 * Aucun prestataire externe : la demande est purement interne. Le lien de
 * signature pointe vers la page front d'acceptation, et le consentement est
 * recueilli par `POST /signatures/:requestId/acknowledge` (horodatage SERVEUR,
 * adresse IP, empreinte SHA-256 du PDF calculée ICI, à l'ouverture — elle fige
 * ce qui a été présenté au signataire).
 *
 * Valeur probatoire : commencement de preuve (aucune revendication eIDAS) —
 * voir le certificat d'acceptation généré à l'acknowledge.
 */
@Injectable()
export class SimpleAcknowledgementProvider implements SignatureProvider {
  private readonly logger = new Logger(SimpleAcknowledgementProvider.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    private readonly cloudStorage: CloudStorageService,
  ) {}

  async createEmbeddedSignatureRequest(
    params: CreateEmbeddedSignatureParams,
  ): Promise<EmbeddedSignatureResult> {
    // Préfixe `ack_` : distingue à l'œil nu une demande interne d'un id
    // YouSign dans les journaux et en base, sans jamais servir de logique.
    const requestId = `ack_${randomUUID()}`;
    const documentHash = createHash('sha256')
      .update(params.documentBuffer)
      .digest('hex');

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const signingUrl = `${frontendUrl}/dashboard/signatures/${requestId}/acknowledge`;

    this.logger.log(
      `Acceptation certifiée ouverte : requestId=${requestId} document=${params.documentName} sha256=${documentHash.slice(0, 12)}…`,
    );

    return {
      requestId,
      // Pas de signataire côté prestataire : l'identité est celle du compte
      // authentifié qui appellera l'acknowledge (anti-IDOR sur signature.userId).
      signerId: `ack_signer_${randomUUID()}`,
      signingUrl,
      provider: 'acknowledge',
      documentHash,
    };
  }

  /**
   * L'exemplaire définitif est le document PRÉSENTÉ : aucun contresignage
   * n'existe sur ce parcours — la preuve d'acceptation est portée par le
   * certificat séparé, pas par une variante du contrat. On restitue donc le
   * PDF d'origine depuis le stockage (LSP : le contrat « exemplaire définitif »
   * est honoré, jamais un NotImplemented).
   */
  async downloadSignedDocument(requestId: string): Promise<Buffer> {
    const signature = await this.signatureRepo.findOne({
      where: { youSignRequestId: requestId },
    });
    if (!signature?.documentId) {
      throw new Error(`Aucun document pour la demande d'acceptation ${requestId}`);
    }
    const document = await this.documentRepo.findOne({
      where: { id: signature.documentId },
    });
    if (!document) {
      throw new Error(
        `Document ${signature.documentId} introuvable pour la demande ${requestId}`,
      );
    }

    const publicId = this.cloudStorage.isObjectName(document.path)
      ? document.path
      : document.filename;
    const url = await this.cloudStorage.getSignedUrl(publicId, 5, 'raw');
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Téléchargement du document ${document.id} impossible (HTTP ${res.status})`,
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * Rien à clore chez un prestataire : la demande n'existe qu'en base, et la
   * transition CANCELLED/EXPIRED appartient aux use cases appelants (contrat
   * du port). No-op journalisé, à parité avec le best-effort YouSign.
   */
  async cancelSignatureRequest(requestId: string): Promise<void> {
    this.logger.log(
      `Acceptation certifiée ${requestId} : annulation sans effet prestataire (demande interne)`,
    );
  }

  /** Statut lu en base et traduit dans le vocabulaire YouSign des appelants. */
  async getSignatureRequestStatus(requestId: string): Promise<string> {
    const signature = await this.signatureRepo.findOne({
      where: { youSignRequestId: requestId },
    });
    if (!signature) throw new Error(`Demande d'acceptation ${requestId} introuvable`);
    switch (signature.statut) {
      case SignatureStatus.SIGNED:
        return 'done';
      case SignatureStatus.EXPIRED:
        return 'expired';
      case SignatureStatus.CANCELLED:
        return 'canceled';
      case SignatureStatus.PENDING:
      default:
        return 'ongoing';
    }
  }
}
