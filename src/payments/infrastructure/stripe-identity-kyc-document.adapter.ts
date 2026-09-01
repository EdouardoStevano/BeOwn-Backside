import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from 'src/profiles/applications/ports/repositories/profil.repository';
import {
  KycDocumentSource,
  type KycDocumentFace,
  type KycIdentityDocument,
} from '../applications/ports/kyc-document.port';

/**
 * Branche `KycDocumentSource` sur les fichiers collectés par Stripe Identity.
 *
 * Le dossier KYC (`kyc.identiteExtrait`) conserve les identifiants
 * `documentFrontFileId` / `documentBackFileId` posés lors du traitement du
 * rapport de vérification. Ces fichiers appartiennent au COMPTE PLATEFORME :
 * l'adaptateur télécharge leur contenu depuis l'API Files
 * (`files.stripe.com/v1/files/{id}/contents`) pour que l'appelant puisse les
 * re-téléverser dans le périmètre du compte connecté.
 *
 * DÉGRADATION VOLONTAIRE. L'accès au contenu des fichiers Identity est soumis
 * à une activation côté Stripe (« access to images ») : sans elle, l'API
 * répond 403. Toute défaillance ici — accès non activé, fichier purgé, réseau
 * — se solde par `null` et un log explicite, jamais par une exception :
 * l'attache du document est un confort, le compte de retrait doit se créer
 * quoi qu'il arrive.
 */
@Injectable()
export class StripeIdentityKycDocumentAdapter implements KycDocumentSource {
  private readonly logger = new Logger(StripeIdentityKycDocumentAdapter.name);

  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profils: ProfilRepository,
    private readonly config: ConfigService,
  ) {}

  async findByUserId(userId: number): Promise<KycIdentityDocument | null> {
    const kyc = await this.profils.findKycByUserId(userId);
    const frontId = kyc?.identiteExtrait?.documentFrontFileId;
    if (!frontId) return null;

    const front = await this.downloadFile(frontId, userId);
    if (!front) return null;

    const backId = kyc?.identiteExtrait?.documentBackFileId;
    // Le verso est optionnel (passeport) : son échec de téléchargement ne
    // condamne pas le recto — mieux vaut un document partiel que rien.
    const back = backId ? await this.downloadFile(backId, userId) : null;

    return { front, back };
  }

  private async downloadFile(
    fileId: string,
    userId: number,
  ): Promise<KycDocumentFace | null> {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) return null;

    try {
      const response = await fetch(
        `https://files.stripe.com/v1/files/${fileId}/contents`,
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );
      if (!response.ok) {
        this.logger.warn(
          `Pièce KYC inaccessible (fichier ${fileId}, userId=${userId}) : ` +
            `HTTP ${response.status} — l'accès aux images Identity est-il activé ?`,
        );
        return null;
      }
      const mimeType =
        response.headers.get('content-type') ?? 'application/octet-stream';
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length === 0) return null;

      const extension = mimeType.includes('png')
        ? 'png'
        : mimeType.includes('pdf')
          ? 'pdf'
          : 'jpg';
      return { data, mimeType, filename: `identite-${fileId}.${extension}` };
    } catch (error) {
      this.logger.warn(
        `Téléchargement de la pièce KYC échoué (fichier ${fileId}, userId=${userId}) : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
