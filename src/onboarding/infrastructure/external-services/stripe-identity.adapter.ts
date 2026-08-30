import { Injectable, Logger } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-return --
   Le client Stripe est typé `any` : c'est le propre d'une Anti-Corruption
   Layer que d'absorber un modèle externe non maîtrisé (§20). Les `any`
   s'arrêtent à ce fichier — tout ce qui en sort est typé par
   `IdentityVerificationPort`. Ce qui protège réellement la traduction, c'est
   `stripe-identity.adapter.spec.ts`, qui épingle la forme observée des
   réponses : c'est l'absence d'un tel test, et non l'absence de types, qui a
   laissé `document.files` être lu comme un objet pendant si longtemps. */
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import type {
  IdentityVerificationPort,
  KycImageUrls,
  KycReportData,
  VerificationSessionResult,
} from 'src/onboarding/application/ports/identity-verification.port';

/**
 * Adapter de sortie vers Stripe Identity (§2 — driven adapter).
 *
 * Seule classe du contexte KYC qui connaisse le SDK Stripe. Les types du port
 * — `VerificationSessionResult`, `KycReportData`, `KycImageUrls` — sont
 * déclarés côté application ; ils vivaient ici, dans le module Payments, ce qui
 * faisait dépendre le vocabulaire de la vérification d'identité d'un fichier
 * d'infrastructure de paiement.
 */
@Injectable()
export class StripeIdentityAdapter implements IdentityVerificationPort {
  private readonly stripe: any;
  private readonly stripeKey: string;
  private readonly logger = new Logger(StripeIdentityAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cloudStorage: CloudStorageService,
  ) {
    this.stripeKey = config.getOrThrow('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(this.stripeKey, {
      apiVersion: '2026-04-22.dahlia',
    });
  }

  async createVerificationSession(
    userId: number,
    email: string,
  ): Promise<VerificationSessionResult> {
    const session = await this.stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { userId: String(userId), email },
      options: {
        document: {
          require_matching_selfie: true,
          allowed_types: ['id_card', 'passport', 'driving_license'],
        },
      },
      return_url: `${this.config.get('FRONTEND_URL')}/auth/kyc?from=stripe`,
    });

    return {
      sessionId: session.id,
      url: session.url!,
      status: session.status,
    };
  }

  async retrieveVerificationSession(
    sessionId: string,
  ): Promise<VerificationSessionResult> {
    const session =
      await this.stripe.identity.verificationSessions.retrieve(sessionId);
    return {
      sessionId: session.id,
      url: session.url ?? '',
      status: session.status,
      // Même repli que pour les événements : la raison si elle existe, le code
      // technique sinon — il renseigne mieux le RCCI qu'un silence.
      motifEchec: session.last_error?.reason ?? session.last_error?.code,
    };
  }

  async cancelVerificationSession(sessionId: string): Promise<void> {
    await this.stripe.identity.verificationSessions.cancel(sessionId);
  }

  /** Downloads a Stripe Identity file and uploads it to Cloudinary. Returns the Cloudinary public URL. */
  async downloadAndUploadToCloudinary(
    fileId: string,
    folder: string,
    filename: string,
  ): Promise<string | undefined> {
    try {
      const res = await fetch(
        `https://files.stripe.com/v1/files/${fileId}/contents`,
        {
          headers: { Authorization: `Bearer ${this.stripeKey}` },
        },
      );
      if (!res.ok) {
        this.logger.warn(
          `Stripe file download failed: ${fileId} → ${res.status}`,
        );
        return undefined;
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';

      const { publicUrl } = await this.cloudStorage.upload(
        buffer,
        filename,
        contentType,
        folder,
      );
      return publicUrl;
    } catch (err) {
      this.logger.warn(
        `downloadAndUploadToCloudinary failed for ${fileId}: ${err?.message}`,
      );
      return undefined;
    }
  }

  async extractReportData(sessionId: string): Promise<KycReportData | null> {
    try {
      const session = await this.stripe.identity.verificationSessions.retrieve(
        sessionId,
        {
          expand: ['last_verification_report'],
        },
      );
      const report = session.last_verification_report;
      if (!report?.id) return null;

      const doc = report.document;
      const selfie = report.selfie;

      // `document.files` est un **tableau** d'identifiants, ordonné recto puis
      // verso — pas un objet `{ front, back }`. La lecture précédente
      // (`doc.files.front`) rendait donc toujours `undefined`, et avec elle
      // les trois pièces du dossier : les images n'ont jamais pu s'afficher,
      // indépendamment du webhook. Un passeport n'a qu'une entrée.
      const fichiers = (Array.isArray(doc?.files) ? doc.files : []) as string[];

      // Idem pour le selfie : `selfie.selfie` **est** l'identifiant, non un
      // objet qui en contiendrait un. `selfie.document` désigne la pièce à
      // laquelle le visage a été comparé — c'est déjà `fichiers[0]`, et la
      // rendre ici ferait passer une photo de document pour un portrait.
      const sonSelfie: string | undefined =
        typeof selfie?.selfie === 'string'
          ? (selfie.selfie as string)
          : undefined;

      return {
        reportId: report.id,
        nom: doc?.name?.last_name ?? undefined,
        prenom: doc?.name?.first_name ?? undefined,
        dateNaissance: doc?.dob
          ? `${doc.dob.year}-${String(doc.dob.month).padStart(2, '0')}-${String(doc.dob.day).padStart(2, '0')}`
          : undefined,
        nationalite: doc?.nationality ?? undefined,
        typeDocument: doc?.type ?? undefined,
        numeroDocument: doc?.number ?? undefined,
        dateExpiration: doc?.expiration_date
          ? `${doc.expiration_date.year}-${String(doc.expiration_date.month).padStart(2, '0')}-${String(doc.expiration_date.day).padStart(2, '0')}`
          : undefined,
        documentFrontFileId: fichiers[0],
        documentBackFileId: fichiers[1],
        selfieFileId: sonSelfie,
      };
    } catch (err) {
      this.logger.warn(`extractReportData failed: ${err?.message}`);
      return null;
    }
  }

  async getImageUrls(
    reportData: Pick<
      KycReportData,
      'documentFrontFileId' | 'documentBackFileId' | 'selfieFileId'
    >,
  ): Promise<KycImageUrls> {
    // If the IDs are already Cloudinary URLs (stored after upload), return them directly
    const isCloudinaryUrl = (s?: string) =>
      !!s && s.startsWith('https://res.cloudinary.com/');

    if (
      isCloudinaryUrl(reportData.documentFrontFileId) ||
      isCloudinaryUrl(reportData.documentBackFileId) ||
      isCloudinaryUrl(reportData.selfieFileId)
    ) {
      return {
        documentFrontUrl: reportData.documentFrontFileId,
        documentBackUrl: reportData.documentBackFileId,
        selfieUrl: reportData.selfieFileId,
        storedInCloudinary: true,
      };
    }

    // Fallback: generate temporary Stripe file links (1h)
    const makeLink = async (fileId?: string): Promise<string | undefined> => {
      if (!fileId) return undefined;
      try {
        const link = await this.stripe.fileLinks.create({
          file: fileId,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
        return link.url;
      } catch (err) {
        this.logger.warn(
          `fileLink creation failed for ${fileId}: ${err?.message}`,
        );
        return undefined;
      }
    };

    const [documentFrontUrl, documentBackUrl, selfieUrl] = await Promise.all([
      makeLink(reportData.documentFrontFileId),
      makeLink(reportData.documentBackFileId),
      makeLink(reportData.selfieFileId),
    ]);

    return {
      documentFrontUrl,
      documentBackUrl,
      selfieUrl,
      storedInCloudinary: false,
    };
  }
}
